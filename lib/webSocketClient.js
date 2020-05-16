/*
    Idea/Information based on the work of jonassjoh, see: https://github.com/jonassjoh/dspW245/
    Many thanks for all the good work. I translated it from python to node.js and using websocket/Hybi library!

    The MIT License (MIT)

    Copyright (c) 2020 Garfonso

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
*/

const crypto = require('crypto');
const WebSocket = require('ws');

/**
 * Creates a webSocketClient.
 * @param opt - parameters, must have url, user and password.
 */
const webSocketClient = function (opt = {}) {
    const device = {
        ip: opt.ip || '',
        pin: opt.pin || '',
        model: opt.model || '',
        port: opt.port || 8080,
        debug: opt.log ? opt.log.debug || console.log : console.log,
        deviceToken: '',
        deviceId: '',
        salt: '',
        socket: /** @type {WebSocket} */ ({}),
        pingHandler: /** @type {NodeJS.Timeout|undefined} */ (undefined),
        sequence: 1000,
        state: [false]
    };
    device.state = device.model === 'w245' ? [false, false, false, false] : [false];
    console.debug('New webSocketClient with options ', opt);

    //private functions:

    /**
     * Called when data is received.
     * @param {string} data
     */
    function receiveData(data) {
        const message = JSON.parse(data);
        device.debug('Got message: ', message);
        if (message.command === 'event') {
            device.debug(`Socket ${message.event.metadata.idx} now ${message.event.metadata.value}`);
            device.state[message.event.metadata.idx] = message.event.metadata.value === 1;
        }
    }

    function ping() {
        if (device.pingHandler) {
            clearTimeout(device.pingHandler);
        }
        if (device.socket && device.socket.readyState === WebSocket.OPEN) {
            const data = {
                command: 'keep_alive'
            };
            // @ts-ignore
            device.socket.ping(JSON.stringify(data));
        }
        device.pingHandler = setTimeout(ping, 5000);
    }

    /**
     * Connects via socket.
     */
    function connect() {
        return new Promise((resolve, reject) => {
            device.socket = new WebSocket('https://' + device.ip + ':' + device.port + '/SwitchCamera', {
                protocolVersion: 13,
                rejectUnauthorized: false,
                timeout: 10000
            });
            // @ts-ignore
            device.socket.on('close', (code, reason) => {
                device.debug('Socket closed: ' + reason + '(' + code + ')');
                device.connected = false;
                reject(new Error(`Socket closed: ${reason} (${code})`));
            });
            // @ts-ignore
            device.socket.on('error', (e) => {
                device.debug('Socket error:', e);
                device.connected = false;
                reject(new Error('Socket error: ' + e));
            });
            // @ts-ignore
            device.socket.on('open', () => {
                device.debug('Socket open');
                resolve(true);
            });
            // @ts-ignore
            device.socket.on('message', receiveData);
            // @ts-ignore
            device.socket.on('ping', d => device.debug('Pinged.', d));
            // @ts-ignore
            device.socket.on('pong', d => device.debug('Ponged.', d));
            // @ts-ignore
            device.socket.on('unexpected-response', (request, response) => device.debug('Unexpected response: ', response, 'to', request));
            // @ts-ignore
            //device.socket.on('upgrade', r => device.debug('Upgraded:', r));

            //does this happen?
            // @ts-ignore
            device.socket.on('timeout', () => device.debug('Connection timeout'));

            device.pingHandler = setTimeout(ping, 5000);
        });
    }

    /**
     * Ends socket connection
     */
    function disconnect() {
        if (device.socket) {
            device.socket.close();
            // @ts-ignore
            setTimeout(device.socket.terminate, 500); //force close after some time.
        }
        if (device.pingHandler) {
            clearTimeout(device.pingHandler);
        }
        device.connected = false;
    }

    /**
     * Generates device token from pin and salt (salt needs to be retrieved first).
     * @returns {string}
     */
    function generateDeviceToken() {
        const shasum = crypto.createHash('sha1');
        shasum.update(device.pin);
        shasum.update(device.salt);
        return device.deviceId + '-' + shasum.digest('hex');
    }

    function buildJSON(data) {
        const d = data || {};
        device.sequence += 1;
        d.sequence_id = device.sequence; // Does not matter.
        d.local_cid = 41556;  // Does not matter.
        d.timestamp = Math.round(Date.now() / 1000);
        d.client_id = '';
        if (device.deviceId) {
            d.device_id = device.deviceId;
            d.device_token = generateDeviceToken();
        }
        return d;
    }

    /**
     * Sends JSON data (as object) via socket.
     * @param {Record<string, any>} data
     */
    function sendJson(data) {
        //augment data:
        const obj = buildJSON(data);
        const toSend = JSON.stringify(obj);
        // @ts-ignore
        device.socket.send(toSend, () => device.debug(toSend, 'written.'));
        return device.sequence;
    }

    function sendJsonAsync(data) {
        return new Promise((resolve, reject) => {
            function handleMessage(messageText) {
                const message = JSON.parse(messageText);
                if (message.sequence_id !== expectedSequence) {
                    device.debug('Unexpected message with sequence_id: ' + message.sequence_id);
                } else {
                    resolve(message);
                    // @ts-ignore
                    device.socket.removeListener('message', handleMessage);
                }
            }

            // @ts-ignore
            device.socket.on('message', handleMessage);
            // @ts-ignore
            device.socket.once('close', (code, reason) => reject(new Error(`Socket closed: ${reason} (${code})`)));
            // @ts-ignore
            device.socket.once('error', (error) => reject(new Error('Socket error: ' + error)));
            const expectedSequence = sendJson(data);
        });
    }

    //API:
    return {
        connect: connect,
        close: disconnect,

        login: async function () {
            if (!device.socket || device.socket.readyState !== WebSocket.OPEN) {
                device.debug('Need to connect. Doing that now.');
                await connect();
            }
            device.debug('Connected. Signing in.');
            const message = await sendJsonAsync({command: 'sign_in'});
            device.salt = message.salt;
            device.deviceId = message.device_id;
            device.shortId = device.deviceId.substring(device.deviceId.length - 4);
            device.connected = true;
            return true;
        },

        /**
         * Returns true if device ready
         * @returns {Promise<boolean>}
         */
        isDeviceReady: function () {
            return new Promise((resolve) => resolve(device.connected));
        },

        /**
         * Switches a socket (1 for DSP-W115 or 1-4 for DSP-W245)
         * @param {boolean} on target state
         * @param {number} [socket] to switch
         * @returns {Promise<boolean>}
         */
        switch: async function(on, socket = 1) {
            const message = await sendJsonAsync({
                command: 'set_setting',
                setting:[{
                    uid: 0,
                    metadata: {
                        value: on ? 1 : 0
                    },
                    //name: `DSP-${device.model}-${device.shortId}-${socket}`,
                    idx: socket - 1,
                    type: 16
                }]
            });
            if (message.code !== 0) {
                throw new Error(`API Error ${message.code}: ${message.message}`);
            }
            return true;
        },

        /**
         * Gets state of socket
         * @returns {Promise<boolean>}
         */
        state: async function () {
            return device.state[0]; //TODO: does not really do what I want... hm. :-(
        }
    };
};

module.exports = webSocketClient;

