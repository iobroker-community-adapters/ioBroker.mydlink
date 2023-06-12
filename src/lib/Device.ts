import { Client } from './Clients';
import { DeviceInfo } from './DeviceInfo';
import { Suffixes } from './suffixes';
import {Mydlink} from './mydlink';

export class WrongMacError extends Error {
    static errorName = 'WRONGMAC';
    name = 'WRONGMAC';
    constructor(message: string) {
        super(message);
    }
}

export class WrongModelError extends Error {
    static errorName = 'WRONGMODEL';
    name = 'WRONGMODEL';
    constructor(message: string) {
        super(message);
    }
}

/**
 * Get code from network error.
 * @param {Record<string, any>} e
 * @returns {number|string}
 */
export function processNetworkError(e: Record<string, any>) : number | string {
    if (e.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        //See if we are logged out -> login again on next poll.
        //otherwise ignore and try again later?
        return e.response.status;
    } else if (e.request) {
        // The request was made but no response was received
        // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
        // http.ClientRequest in node.js
        //probably ECONNRESET or Timeout -> e.code should be set.
        return e.code;
    } else {
        //something else...?
        return e.code;
    }
}

export abstract class Device extends DeviceInfo {
    readonly adapter: Mydlink;
    abstract client: Client;
    protected constructor (adapter : Mydlink, ip : string, pin: string, pinEncrypted: boolean) {
        super(ip, pin, pinEncrypted);
        this.adapter = adapter;
    }

    /**
     * Stores device configuration as Device Object in ioBroker Database.
     */
    async createDeviceObject () : Promise<void> {
        //do something here.
        if (!this.id) {
            if (!this.mac) {
                this.adapter.log.warn('Could not create device ' + this.name + ' without MAC. Please check config or if device is online.');
                return;
            }
        }

        //also set the native part of the device:
        await this.adapter.extendObjectAsync(this.id, {
            type: 'device',
            common: {
                name: this.name,
                statusStates: {
                    onlineId: `${this.adapter.namespace}.${this.id}${Suffixes.reachable}`
                }
            } as Partial<ioBroker.DeviceCommon>,
            native: {
                ip: this.ip,
                mac: this.mac,
                pin: this.pinEncrypted,
                pollInterval: this.pollInterval,
                enabled: this.enabled,
                name: this.name,
                model: this.model,
                useWebSocket: this.isWebsocket,
                pinNotEncrypted: false
            }
        });
    }

    /**
     * Creates state-objects for the device.
     */
    async createObjects() : Promise<void> {
        //enabled indicator:
        await this.adapter.setObjectNotExistsAsync(this.id + Suffixes.enabled, {
            type: 'state',
            common: {
                name: 'enabled',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false
            },
            native: {}
        });

        //have ready indicator:
        await this.adapter.setObjectNotExistsAsync(this.id + Suffixes.unreachable, {
            type: 'state',
            common: {
                name: 'unreach',
                type: 'boolean',
                role: 'indicator.maintenance.unreach',
                read: true,
                write: false
            },
            native: {}
        });

        //have ready indicator:
        await this.adapter.setObjectNotExistsAsync(this.id + Suffixes.reachable, {
            type: 'state',
            common: {
                name: 'device is reachable',
                type: 'boolean',
                role: 'indicator.reachable',
                read: true,
                write: false
            },
            native: {}
        });
    }

    stop() : void {
        if (this.intervalHandle) {
            this.adapter.clearTimeout(this.intervalHandle);
        }
        if (this.client && typeof this.client.disconnect === 'function') {
            this.client.disconnect();
        }
        this.ready = false;
        this.loggedIn = false;
    }

    /**
     * Starts log in for device. Needs to be done before additional commands can work.
     **/
    async login() : Promise<boolean> {
        try {
            const loginResult = await this.client.login();
            if (loginResult === true) {
                this.adapter.log.debug(`${this.name} successfully logged in: ${loginResult}`);
                this.loggedIn = true;
                this.loginErrorPrinted = false;
            } else {
                if (!this.loginErrorPrinted) {
                    this.loginErrorPrinted = true;
                    this.loggedIn = false;
                    this.adapter.log.debug('Login error: device returned ' + loginResult + ' - this should not really happen.');
                    this.adapter.log.error(this.name + ' could not login. Please check credentials and if device is online/connected.');
                }
            }
        } catch (e : any) {
            this.adapter.log.debug('Login error: ' + e.stack);

            if (!this.loginErrorPrinted && e.code !== 'ETIMEDOUT' && e.code !== 'ECONNABORTED' && e.code !== 'ECONNRESET' && this.model) {
                this.adapter.log.error(this.name + ' could not login. Please check credentials and if device is online/connected. Error: ' + e.code + ' - ' + e.stack);
                this.loginErrorPrinted = true;
            }

            this.loggedIn = false;
            if (!this.pollInterval && this.model) { //if no polling takes place, need to retry login!
                if (this.intervalHandle) {
                    this.adapter.clearTimeout(this.intervalHandle);
                }
                this.intervalHandle = this.adapter.setTimeout(() => this.start(), 10000); //retry here if no polling.
            }
        }
        return this.loggedIn;
    }

    /**
     * Identification of device needs to happen after successful login.
     * Problem: Maybe needs to create new object of new type. Hm...
     */
    async identify() : Promise<boolean> {
        //for device identification by IP set name to model here:
        if (!this.name) {
            this.name = this.model;
        }

        await this.createObjects();
        this.identified = true;
        return this.identified;
    }

    async handleNetworkError(e: any) : Promise<void> {
        const code = processNetworkError(e);
        if ([403, 424].includes(code as number) || this.ready) {
            this.loggedIn = false; //login next polling.
        }
        this.adapter.log.debug('Error during communication ' + this.name + ': ' + code + ' - ' + e.stack + ' - ' + e.body);
        this.ready = false;
        await this.adapter.setStateChangedAsync(this.id + Suffixes.unreachable, true, true);
        await this.adapter.setStateChangedAsync(this.id + Suffixes.reachable, false, true);
    }

    /**
     * Do polling here.
     * @returns {Promise<void>}
     */
    async onInterval() : Promise<void> {
        //this.log.debug('Polling ' + this.name);
        try {
            if (!this.loggedIn) {
                await this.login();
            }
            if (this.loggedIn && !this.identified) {
                await this.identify();
            }
            if (this.loggedIn && this.identified) {
                this.ready = await this.client.isDeviceReady();
                await this.adapter.setStateChangedAsync(this.id + Suffixes.unreachable, !this.ready, true);
                await this.adapter.setStateAsync(this.id + Suffixes.reachable, this.ready, true);
            }
        } catch (e: any) {
            await this.handleNetworkError(e);
        }

        if (this.pollInterval > 0) { //only start timeout again, if set in settings.
            this.intervalHandle = this.adapter.setTimeout(() => this.onInterval(),
                this.pollInterval);
        }
    }

    /**
     * starting communication with device from config.
     * @returns {Promise<boolean>}
     */
    async start() : Promise<void> {
        //if device was already started -> stop it.
        //(use case: ip did change or settings did change)
        if (this.ready) {
            this.stop();
        }

        //interrogate enabled devices
        //this will get MAC for manually configured devices.
        if (this.enabled) {
            //login:
            await this.login();
            if (this.loggedIn) {
                try {
                    await this.identify();
                    this.ready = await this.client.isDeviceReady();
                    await this.adapter.setStateAsync(this.id + Suffixes.reachable, this.ready, true);
                    await this.adapter.setStateAsync(this.id + Suffixes.unreachable, !this.ready, true);
                } catch (e: any) {
                    this.adapter.log.error(this.name + ' could not identify device: ' + e.stack);
                }
            }
        }

        //transfer enabled flag to object:
        await this.adapter.setStateAsync(this.id + Suffixes.enabled, {val: this.enabled, ack: true});

        //start polling if device is enabled (do this after all is set up).
        if (this.enabled) {
            //some devices, for example W245, don't push. So poll websocket also.
            let interval = this.pollInterval;
            if (interval !== undefined && !Number.isNaN(interval) && interval > 0) {
                if (interval < 500) {
                    this.adapter.log.warn('Increasing poll rate to twice per second. Please check device config.');
                    interval = 500; //polling twice every second should be enough, right?
                }
                if (interval >= 2147483647) {
                    interval = 2147483646;
                    this.adapter.log.warn('Poll rate was too high, reduced to prevent issues.');
                }
                this.adapter.log.debug('Start polling for ' + this.name + ' with interval ' + interval);
                this.pollInterval = interval;
                this.intervalHandle = this.adapter.setTimeout(() => this.onInterval(),
                    this.pollInterval);
            } else {
                this.pollInterval = 0;
                this.adapter.log.debug('Polling of ' + this.name + ' disabled, interval was ' + interval + ' (0 means disabled)');
            }
        }
    }

    /**
     * process a state change.
     * @param _id
     * @param _state
     */
    async handleStateChange(_id : string, _state : ioBroker.State) : Promise<void> {
        if (this.loggedIn) {
            await this.login();
        }
    }

}

