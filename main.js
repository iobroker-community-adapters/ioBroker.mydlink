/**
 *
 *      ioBroker mydlink Adapter
 *
 *      (c) 2019 Garfonso <garfonso@mobo.info>
 *
 *      MIT License
 *
 */

'use strict';

/*
 * Created with @iobroker/create-adapter v2.2.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');
const deviceFlags = require('./lib/deviceFlags');

// Load your modules here, e.g.:
// const fs = require('fs');
const createSoapClient = require('./lib/soapclient.js');
const axios = require('axios').default;

class MyDlink extends utils.Adapter {

    /**
     * Reads settings from device and sets flags for object creation and polling.
     * @param {Device} device
     * @returns {Promise<*>}
     */
    async identifyDevice(device) {
        //get device settings, which returns model name and firmware version. So we know what states to create.
        let mac;
        let canSwitch;
        if (device.useWebSocket) {
            //is mac stripped of :
            const id = device.client.getDeviceId();
            mac = id.match(/.{2}/g).join(':').toUpperCase(); //add back the :.
            canSwitch = true;

            //get model from webserver / wifi-ssid:
            const url = `http://${device.ip}/login?username=Admin&password=${device.pin}`;
            const result = await axios.get(url);
            if (result.status === 200) {
                const startPos = result.data.indexOf('SSID: ') + 6;
                const model = result.data.substring(startPos, startPos + 8);
                if (!model) {
                    this.log.warn(`${device.name} identify responded with unknown result, please report: ${result.data}`);
                }
                this.log.debug('Got model ' + model + ' during identification of ' + device.name);
                if (model !== device.model) {
                    this.log.debug('Model updated from ' + (device.model || 'unknown') + ' to ' + model);
                    device.model = model;
                    //store new model in device object:
                    await this.createNewDevice(device);
                }
            }
        } else {
            const settings = await device.client.getDeviceSettings();
            this.log.debug(device.name + ' returned following device settings: ' + JSON.stringify(settings, null, 2));
            device.model = settings.ModelName;
            mac = settings.DeviceMacId.toUpperCase();
            canSwitch = device.model.toUpperCase().includes('DSP') || (settings.ModuleTypes.find(t => t.indexOf('Plug') >= 0)); //if is socket, probably can switch on/off
        }

        //check if device is present:
        const oldDevice = this.devices.find(d => d.mac === mac);
        if (oldDevice && oldDevice !== device) {
            this.log.warn('Device with MAC ' + oldDevice.mac + ' already present. ' + device.name + ' and ' + oldDevice.name + ' are the same device?');
        }

        //convert old devices without MAC to new devices:
        if (device.mac && device.mac !== mac) {
            this.log.warn('Device mac differs from stored mac for ' + device.name);
        } else if (!device.mac) {
            device.mac = mac;
            //do that here to allow conversion from old devices.
            const oldId = device.id;
            device.id = idFromMac(device.mac);
            // @ts-ignore
            device.pollInterval = device.pollInterval || this.config.interval;
            await this.createNewDevice(device); //store device settings

            //delete old device:
            // @ts-ignore
            await this.deleteDeviceFull({id: oldId});
        }

        //for device identification by IP set name to model here:
        if (!device.name) {
            device.name = device.model;
        }

        const flags = device.model ? deviceFlags[device.model] : false;
        if (flags) {
            device.flags = /** @type {Record<string, boolean>} */ (flags);
        } else {
            //should work for most devices, including DSP-W115 which might not have model, yet.
            device.flags = {
                canSwitchOnOff: canSwitch,
                hasTemp: false,
                hasPower: false,
                hasTotalPower: false,
                hasLastDetected: false
            };
            if (device.model) {
                let xmls;
                if (device.useWebSocket) {
                    xmls = 'UNKNOWN WEBSOCKET DEVICE: ' + device.model;
                } else {
                    //report unknown device:
                    xmls = await device.client.getDeviceDescriptionXML();
                }
                this.log.info('Found new device, please report the following (full log from file, please) to developer: ' + JSON.stringify(xmls, null, 2));
                if (this.supportsFeature && this.supportsFeature('PLUGINS')) {
                    const sentryInstance = this.getPluginInstance('sentry');
                    if (sentryInstance) {
                        const Sentry = sentryInstance.getSentryObject();
                        if (Sentry) {
                            Sentry.withScope(scope => {
                                scope.setLevel('info');
                                for (const key of Object.keys(xmls)) {
                                    scope.setExtra(key, xmls[key]);
                                }
                                Sentry.captureMessage('Unknown-Device ' + device.model, 'info'); // Level 'info'
                            });
                        }
                    }
                }
            }
        }

        if (device.useWebSocket) {
            //get first status here, after model is known:
            if (device.flags.numSockets !== undefined && device.flags.numSockets > 1) {
                const states = await device.client.state(-1); //get all states.
                for (let index = 1; index <= device.flags.numSockets; index += 1) {
                    await this.setStateChangedAsync(device.id + stateSuffix + '_' + index, states[index -1], true);
                }
            } else {
                const state = await device.client.state();
                await this.setStateChangedAsync(device.id + stateSuffix, state, true);
            }
        }

        await this.createObjects(device);
        device.identified = true;
        return device;
    }

    /**
     * deletes all objects of an device and the device itself (deleteDeviceAsync does not work somehow...?)
     * @param {Device} device
     */
    async deleteDeviceFull(device) {
        //stop device:
        this.stopDevice(device);

        //check if detected device:
        for (const ip of Object.keys(this.detectedDevices)) {
            const dectDevice = this.detectedDevices[ip];
            if (dectDevice.mac === device.id) {
                dectDevice.alreadyPresent = false;
            }
        }

        try {
            const ids = await this.getObjectListAsync({
                startkey: this.namespace + '.' + device.id,
                endkey: this.namespace + '.' + device.id + '\u9999'
            });
            if (ids) {
                for (const obj of ids.rows) {
                    await this.delObjectAsync(obj.value._id);
                }
            }
        } catch (e) {
            this.log.error('Error during deletion of ' + device.id + ': ' + e.stack);
        }
    }

    /**
     * Starts log in for device. Needs to be done before additional commands can work.
     * @param {Device} device
     * @returns {Promise<boolean>}
     */
    async loginDevice(device) {
        try {
            if (device.useWebSocket) {
                device.client = new WebSocketClient({
                    ip: device.ip,
                    pin: device.pin,
                    keepAlive: 5,
                    useTelnetForToken: device.pin.toUpperCase() === 'TELNET',
                    log: console.debug
                });
            } else {
                //create the soapclient
                device.client = createSoapClient({
                    user: 'Admin',
                    password: device.pin,
                    url: 'http://' + device.ip + '/HNAP1'
                }); //no https, sadly.
            }

            const loginResult = await device.client.login();
            if (loginResult === true) {
                this.log.debug(device.name + ' successfully logged in. ' + loginResult);
                device.loggedIn = true;
                device.loginErrorPrinted = false;
            } else {
                if (!device.loginErrorPrinted) {
                    this.log.debug('Login error: soapclient returned ' + loginResult + ' - this should not really happen.');
                    this.log.error(device.name + ' could not login. Please check credentials and if device is online/connected.');
                    device.loginErrorPrinted = true;
                }
            }
        } catch (e) {
            const code = this.processNetworkError(e);
            if (!device.useWebSocket && (code === 500 || code === 'ECONNREFUSED')) { //let's try websocket.
                device.client.disconnect();
                device.useWebSocket = true;
                return this.loginDevice(device);
            }

            this.log.debug('Login error: ' + e.stack);
            if (!device.loginErrorPrinted && e.code !== 'ETIMEDOUT' && e.code !== 'ECONNABORTED' && e.code !== 'ECONNRESET') {
                this.log.error(device.name + ' could not login. Please check credentials and if device is online/connected. Error: ' + e.code + ' - ' + e.stack);
                device.loginErrorPrinted = true;
            }

            device.loggedIn = false;
            if (device.useWebSocket || !device.pollInterval) { //if no polling takes place, need to retry login!
                if (device.intervalHandle) {
                    clearTimeout(device.intervalHandle);
                }
                device.intervalHandle = setTimeout(() => this.startDevice(device), 10000); //retry here if no polling.
            }
        }
        return device.loggedIn;
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {


    }

    /**
     * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
     * Using this method requires 'common.message' property to be set to true in io-package.json
     * @param {ioBroker.Message} obj
     */
    async onMessage(obj) {
        if (typeof obj === 'object' && obj.message) {
            switch(obj.command) {
                case 'discovery': {
                    // Send response in callback if required
                    if (obj.callback) {
                        const devices = [];
                        for (const key of Object.keys(this.detectedDevices)) {
                            const device = this.detectedDevices[key];
                            device.readOnly = true;
                            devices.push(device);
                        }
                        this.sendTo(obj.from, obj.command, devices, obj.callback);
                    }
                    break;
                }
                case 'getDevices': {
                    const devices = await this.getDevicesAsync();
                    const tableDevices = [];
                    for (const device of devices)  {
                        device.native.pin = DeviceInfo.encryptDecrypt(this.secret, device.native.pin);
                        tableDevices.push(device.native);
                    }
                    if (obj.callback) {
                        this.sendTo(obj.from, obj.command, tableDevices, obj.callback);
                    }
                    break;
                }
                case 'identifyDevice': {
                    const params = /** @type {Record<string, any>} */ (obj.message);
                    if (params && params.ip && params.pin) {
                        const device = new DeviceInfo(params.ip, params.pin);
                        await this.startDevice(device);
                        if (device.loggedIn && device.identified) { //will be false if ip wrong or duplicate mac.
                            this.devices.push(device);
                        }
                        const sendDevice = {
                            mac: device.mac,
                            name: device.name,
                            ip: device.ip,
                            pollInterval: device.pollInterval,
                            pin: device.pin,
                            enabled: device.loggedIn && device.identified
                        };
                        if (obj.callback) {
                            this.sendTo(obj.from, obj.command, sendDevice, obj.callback);
                        }
                    }
                    break;
                }
                default: {
                    this.log.debug('Unknown command ' + obj.command);
                    break;
                }
            }

        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new MyDlink(options);
} else {
    // otherwise start the instance directly
    new MyDlink();
}
