import {Device, processNetworkError, WrongMacError, WrongModelError} from './Device';
import {Suffixes} from './suffixes';
import {Mydlink} from './mydlink';
import {default as axios} from 'axios';
import WebSocketClient from 'dlink_websocketclient';

export class WebSocketDevice extends Device {
    client: WebSocketClient;

    numSockets = 1;

    constructor(adapter: Mydlink, ip: string, pin: string, pinEncrypted: boolean) {
        super(adapter, ip, pin, pinEncrypted);
        this.isWebsocket = true;

        this.client = new WebSocketClient({
            ip: this.ip,
            pin: this.pinDecrypted,
            keepAlive: 5,
            useTelnetForToken: this.pinDecrypted?.toUpperCase() === 'TELNET',
            log: console.debug
        });
    }

    /**
     * Creates objects for the device.
     */
    async createObjects() : Promise<void> {
        await super.createObjects();
        if (this.numSockets > 1) {
            //create state for each socket.
            for (let index = 1; index <= this.numSockets; index += 1) {
                const id = this.id + Suffixes.state + '_' + index;
                await this.adapter.setObjectNotExistsAsync(id, {
                    type: 'state',
                    common: {
                        name: 'Socket ' + index,
                        type: 'boolean',
                        role: 'switch',
                        read: true,
                        write: true
                    },
                    native: { index: index }
                });
                await this.adapter.subscribeStatesAsync(id);
            }
        } else {
            //create state object, for plug this is writable for sensor not.
            await this.adapter.setObjectNotExistsAsync(this.id + Suffixes.state, {
                type: 'state',
                common: {
                    name: 'state of plug',
                    type: 'boolean',
                    role: 'switch',
                    read: true,
                    write: true
                },
                native: {}
            });
            await this.adapter.subscribeStatesAsync(this.id + Suffixes.state);
        }
    }

    stop() : void {
        super.stop();
        if (this.client && typeof this.client.removeAllListeners === 'function') {
            this.client.removeAllListeners('switch');
            this.client.removeAllListeners('error');
            this.client.removeAllListeners('close');
            this.client.removeAllListeners('message');
        }
    }

    /**
     * Do polling here.
     * @returns {Promise<void>}
     */
    async onInterval() : Promise<void> {
        await super.onInterval();
        // if not ready -> communication did fail, will be retried on next poll.
        if (this.ready) {
            try {
                if (this.numSockets > 1) {
                    const states = await this.client.state(-1) as Array<boolean>; //get all socket states.
                    for (let index = 1; index <= this.numSockets; index += 1) {
                        const id = this.id + Suffixes.state + '_' + index;
                        const val = states[index - 1];
                        await this.adapter.setStateChangedAsync(id, val, true);
                    }
                } else {
                    const val = await this.client.state(0) as boolean;
                    await this.adapter.setStateChangedAsync(this.id + Suffixes.state, val, true);
                }
            } catch (e) {
                await this.handleNetworkError(e);
            }
        }
    }

    /**
     * Error handler for event base client.
     */
    async onError(code? : number, err? : Error) : Promise<void> {
        await this.adapter.setStateAsync(this.id + Suffixes.unreachable, true, true);
        if (code || err) {
            this.adapter.log.debug(`${this.name}: Socket error: ${code} - ${(err ? err.stack : err)}`);
        } else {
            this.adapter.log.debug(this.name + ': Socket closed.');
        }
        this.stop();
        this.ready = false;
        //abuse unused intervalHandle here.
        if (this.intervalHandle) {
            this.adapter.clearTimeout(this.intervalHandle);
        }
        this.intervalHandle = this.adapter.setTimeout(() => {
            this.start();
        }, 10000);
    }

    /**
     * starting communication with device from config.
     * @returns {Promise<boolean>}
     */
    async start() : Promise<void> {
        await super.start();

        //event listener:
        this.client.on('switched', async (val : boolean, socket : number) => {
            this.adapter.log.debug(`Event from device ${socket} now ${val}`);
            if (this.numSockets > 1) {
                await this.adapter.setStateAsync(this.id + Suffixes.state + '_' + (socket + 1), val, true);
            } else {
                await this.adapter.setStateAsync(this.id + Suffixes.state, val, true);
            }
        });
        //error handling:
        this.client.on('error', (code : number, error : Error) => this.onError(code, error));
        this.client.on('close', () => this.onError());
        this.client.on('message', (message : string) => this.adapter.log.debug(`${this.name} got message: ${message}`));
        await this.adapter.setStateAsync(this.id + Suffixes.unreachable, false, true);
        this.ready = true;
        this.adapter.log.debug('Setup device event listener.');
    }

    /**
     * process a state change. Device will just try to switch plug. Children will have to overwrite this behaviour.
     * @param id
     * @param state
     */
    async handleStateChange(id : string, state : ioBroker.State) : Promise<void> {
        if (typeof state.val === 'boolean') {
            if (!this.loggedIn) {
                await this.login();
            }

            let socket = 0;
            if (this.numSockets > 1) {
                socket = Number(id.substring(id.lastIndexOf('_') + 1)) - 1; //convert to 0 based index here.
            }
            try {
                const newVal = await this.client.switch(state.val, socket);
                this.adapter.log.debug(`Switched Socket ${socket} of ${this.name} ${state.val ? 'on' : 'off'}.`);
                await this.adapter.setStateAsync(id, newVal, true);
            } catch(e: any) {
                const code = processNetworkError(e);
                if (code === 403) {
                    this.loggedIn = false; //login next polling.
                }
                this.adapter.log.error('Error while switching device ' + this.name + ': ' + code + ' - ' + e.stack);
            }
        } else {
            this.adapter.log.warn('Wrong state type. Only boolean accepted for switch.');
        }
    }

    async getModelInfoForSentry() : Promise<any> {
        const url = `http://${this.ip}/login?username=Admin&password=${this.pinDecrypted}`;
        const result = await axios.get(url);
        return result.data;
    }

    async identify() : Promise<boolean> {
        const id = this.client.getDeviceId();
        const mac = id.match(/.{2}/g)!.join(':').toUpperCase(); //add back the :.

        if (this.mac && this.mac !== mac) {
            throw new WrongMacError(`${this.name} reported mac ${mac}, expected ${this.mac}, probably ip ${this.ip} wrong and talking to wrong device?`);
        }
        this.mac = mac;
        this.id = id;

        //get model from webserver / wifi-ssid:
        const url = `http://${this.ip}/login?username=Admin&password=${this.pinDecrypted}`;
        try {
            const result = await axios.get(url);
            if (result.status === 200) {
                const startPos = result.data.indexOf('SSID: ') + 6;
                const model = result.data.substring(startPos, startPos + 8);
                if (!model) {
                    this.adapter.log.warn(`${this.name} identify responded with unknown result, please report: ${result.data}`);
                }
                this.adapter.log.debug('Got model ' + model + ' during identification of ' + this.name);
                if (model !== this.model) {
                    const oldModel = this.model;
                    this.model = model;
                    this.adapter.log.info('Model updated from ' + (oldModel || 'unknown') + ' to ' + model);
                    throw new WrongModelError(`${this.name} model changed from ${oldModel} to ${model}`);
                }
            } else {
                this.adapter.log.warn(`${this.name} could not be identified: ${result.data}`);
            }
        } catch (e) {
            const code = await this.handleNetworkError(e);
            console.log('Got code: ' + code);
            if (code === 'ECONNREFUSED') {
                this.adapter.log.debug('Failed to identify -> for now assume W118, because that one is nasty.');
                const model = 'DSP-W118';
                if (model !== this.model) {
                    const oldModel = this.model;
                    this.model = model;
                    this.adapter.log.info('Model updated from ' + (oldModel || 'unknown') + ' to ' + model);
                    throw new WrongModelError(`${this.name} model changed from ${oldModel} to ${model}`);
                }
            }
        }

        //make sure objects are created.
        const superResult = await super.identify();

        //get current state:
        if (this.numSockets > 1) {
            const states = await this.client.state(-1) as Array<boolean>; //get all states.
            for (let index = 1; index <= this.numSockets; index += 1) {
                await this.adapter.setStateChangedAsync(this.id + Suffixes.state + '_' + index, states[index -1], true);
            }
        } else {
            const state = await this.client.state() as boolean;
            await this.adapter.setStateChangedAsync(this.id + Suffixes.state, state, true);
        }

        return superResult;
    }
}