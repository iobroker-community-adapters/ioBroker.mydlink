import { Client } from './Clients';
import { DeviceInfo } from './DeviceInfo';
import { Suffixes } from './suffixes';
import {Mydlink} from '../main';
import {KnownDevices} from './KnownDevices';
import {TableDevice} from './TableDevice';
import {SoapDevice} from './soapDevice';
import {WebSocketDevice} from './WebSocketDevice';

export interface DeviceConstructor<T> {
    new (adapter: Mydlink, ip: string, pin: string, pinEncrypted: boolean): T;
}

export class WrongMacError extends Error {
    name = 'WRONGMAC';
    constructor(message: string) {
        super(message);
    }
}

export class WrongModelError extends Error {
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
export function processNetworkError(e: Record<string, any>) {
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

function deviceObjetToTableDevice(configDevice: ioBroker.DeviceObject) : TableDevice {
    return {
        name: configDevice.native.name,
        mac: configDevice.native.mac,
        ip: configDevice.native.ip,
        pin: configDevice.native.pin,
        pollInterval: configDevice.native.pollInterval,
        enabled: configDevice.native.enabled,
    }
}

export abstract class Device extends DeviceInfo {
    readonly adapter: Mydlink;
    abstract client: Client;
    constructor (adapter : Mydlink, ip : string, pin: string, pinEncrypted: boolean) {
        super(ip, pin, pinEncrypted);
        this.adapter = adapter;
    }

    /**
     * Create DeviceInfo from ioBroker object, old createDeviceFromConfig (model known)
     * @param adapter ioBroker Adapter
     * @param configDevice ioBroker device object
     * @returns Promise<Device>
     */
    static async createFromObject(adapter : Mydlink, configDevice: ioBroker.DeviceObject) : Promise<Device> {
        const native = configDevice.native;
        const pinEncrypted = (native.mac && !native.pinNotEncrypted);
        if (native.model) {
            return Device.createDevice(adapter, {
                ip: native.ip,
                pin: native.pin,
                pinEncrypted,
                model: native.model,
                mac: native.mac,
                name: native.name,
                enabled: native.enabled,
                isWebsocket: native.useWebsocket
            });
        } else {
            adapter.log.info(`Model still unknown for ${native.name}. Trying to identify.`);
            return Device.createFromTable(adapter, deviceObjetToTableDevice(configDevice), pinEncrypted, native.useWebsocket);
        }
    }

    /**
     * Create a device with model known.
     * @param adapter
     * @param params
     */
    static async createDevice(adapter: Mydlink, params : {
        ip: string, pin: string, pinEncrypted: boolean, model: string,
        pollInterval?: number, mac?: string, id?: string,
        isWebsocket?: boolean, name?: string, enabled?: boolean}) : Promise<Device> {

        let device;
        const deviceFlags = KnownDevices[params.model];
        if (deviceFlags) {
            device = new deviceFlags.DeviceType(adapter, params.ip, params.pin, params.pinEncrypted);
        } else {
            adapter.log.info(`Unknown device type ${params.model} for ${params.name}. Trying to identify.`);
            if (params.isWebsocket) {
                device = new WebSocketDevice(adapter, params.ip, params.pin, params.pinEncrypted);
            } else {
                device = new SoapDevice(adapter, params.ip, params.pin, params.pinEncrypted);
            }
        }
        device.pollInterval = device.pollInterval || params.pollInterval;
        device.mac = device.mac || params.mac;
        device.id = device.id || params.id;
        device.name = device.name || params.name;
        device.model = params.model;
        device.enabled = device.enabled || params.enabled;
        device.isWebsocket = device.isWebsocket || params.isWebsocket;
        return device;
    }

    /**
     * Creates DeviceInfo from configuration-Table object (model unknown).
     * @param adapter ioBroker Adapter
     * @param tableDevice
     * @param doDecrypt
     * @returns @returns Promise<Device>
     */
    static async createFromTable(adapter : Mydlink, tableDevice: TableDevice, doDecrypt = false, forceWebsocket = false) : Promise<Device> {
        const pinEncrypted = (doDecrypt && Boolean(tableDevice.mac));
        const mac = tableDevice.mac ? tableDevice.mac.toUpperCase() : '';

        let device;
        //first try soap:
        if (!forceWebsocket) {
            device = new SoapDevice(adapter, tableDevice.ip, tableDevice.pin, pinEncrypted);
        } else {
            device = new WebSocketDevice(adapter, tableDevice.ip, tableDevice.pin, pinEncrypted);
        }

        device.mac = mac;
        device.pollInterval = tableDevice.pollInterval !== undefined && isFinite(Number(tableDevice.pollInterval)) && tableDevice.pollInterval >= 0 ? Number(tableDevice.pollInterval) : 30000;
        if (device.mac) {
            device.idFromMac();
        }
        device.name = tableDevice.name || device.name;
        device.enabled = tableDevice.enabled !== undefined ? tableDevice.enabled : device.enabled;

        try {
            await device.login();
            if (device.loggedIn) {
                //ok, login worked. -> seems to be soap device, identify:
                await device.identify();
            } else {
                throw new Error('Device not logged in... why?');
            }
        } catch (e: any) {
            device.stop(); //stop old device in any case!
            const code = processNetworkError(e);
            if (!forceWebsocket && (code === 500 || code === 'ECONNREFUSED')) { //try websocket.
                return Device.createFromTable(adapter, tableDevice, doDecrypt, true);
            }

            if (e.name === WrongModelError.name) {
                //model was wrong -> recreate with new model information.
                adapter.log.debug(`Found ${device.model} for ${device.name}. Create a fitting device.`);
                return Device.createDevice(adapter, {
                    model: device.model,
                    ip: device.ip,
                    pinEncrypted: false,
                    pin: device.pinDecrypted,
                    name: device.name,
                    mac: device.mac,
                    pollInterval: device.pollInterval,
                    id: device.id,
                    isWebsocket: device.isWebsocket,
                    enabled: device.enabled
                });
            }

            if (e.name === WrongMacError.name) {
                adapter.log.info(`Device with unexpected MAC ${device.mac} reacted on ${device.ip}. Trying to create new device object for it.`);
                if (device.model) {
                    return Device.createDevice(adapter, {
                        model: device.model,
                        ip: device.ip,
                        pinEncrypted: false,
                        pin: device.pinDecrypted,
                        name: device.name,
                        mac: device.mac,
                        pollInterval: device.pollInterval,
                        id: device.id,
                        isWebsocket: device.isWebsocket,
                        enabled: device.enabled
                    });
                } else {
                    return Device.createFromTable(adapter, {
                        mac: device.mac,
                        ip: device.ip,
                        pin: device.pinDecrypted,
                        name: device.name,
                        pollInterval: device.pollInterval,
                        enabled: device.enabled
                    })
                }
            }

            adapter.log.debug('Login error: ' + e.stack);
            if (!device.loginErrorPrinted && e.code !== 'ETIMEDOUT' && e.code !== 'ECONNABORTED' && e.code !== 'ECONNRESET') {
                adapter.log.error(tableDevice.name + ' could not login. Please check credentials and if device is online/connected. Error: ' + e.code + ' - ' + e.stack);
                device.loginErrorPrinted = true;
            }

            device.loggedIn = false;
        }

        return device;
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
                    onlineId: `${this.adapter.namespace}.${this.id}.${Suffixes.reachable}`
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

            if (!this.loginErrorPrinted && e.code !== 'ETIMEDOUT' && e.code !== 'ECONNABORTED' && e.code !== 'ECONNRESET') {
                this.adapter.log.error(this.name + ' could not login. Please check credentials and if device is online/connected. Error: ' + e.code + ' - ' + e.stack);
                this.loginErrorPrinted = true;
            }

            this.loggedIn = false;
            if (!this.pollInterval) { //if no polling takes place, need to retry login!
                if (this.intervalHandle) {
                    this.adapter.clearTimeout(this.intervalHandle);
                }
                this.intervalHandle = this.adapter.setTimeout(() => this.start(), 10000); //retry here if no polling.
            }
        }
        return this.loggedIn;
    }

    async sendModelInfoToSentry(xmls: Record<string, string>) {
        if (!KnownDevices[this.model]) {
            //unknown device -> report to sentry.
            this.adapter.log.info('Found new device, please report the following (full log from file, please) to developer: ' + JSON.stringify(xmls, null, 2));
            if (this.adapter.supportsFeature && this.adapter.supportsFeature('PLUGINS')) {
                const sentryInstance = this.adapter.getPluginInstance('sentry');
                if (sentryInstance) {
                    const Sentry = sentryInstance.getSentryObject();
                    if (Sentry) {
                        Sentry.withScope((scope : any) => {
                            scope.setLevel('info');
                            for (const key of Object.keys(xmls)) {
                                scope.setExtra(key, xmls[key]);
                            }
                            Sentry.captureMessage('Unknown-Device ' + this.model, 'info'); // Level 'info'
                        });
                    }
                }
            }
        }
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
        if (code === 403 || this.ready) {
            this.loggedIn = false; //login next polling.
        }
        this.adapter.log.debug('Error during communication ' + this.name + ': ' + code + ' - ' + e.stack + ' - ' + e.body);
        this.ready = false;
        await this.adapter.setStateChangedAsync(this.id + Suffixes.unreachable, true, true);
        await this.adapter.setStateChangedAsync(this.id + Suffixes.reachable, false, true);

        let connected = false;
        this.adapter.devices.forEach((device) => { connected = connected || device.ready; }); //turn green if at least one device is ready = reachable.
        await this.adapter.setStateChangedAsync('info.connection', connected, true);
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

                //prevent more interaction with device and reset connection.
                if (this.ready) {
                    //signal that we could at least reach one device:
                    await this.adapter.setStateChangedAsync('info.connection', true, true);
                }
            }
        } catch (e: any) {
            await this.handleNetworkError(e);
        }

        if (this.pollInterval > 0) { //only start timeout again, if set in settings.
            this.intervalHandle = this.adapter.setTimeout(() => this.onInterval,
                this.pollInterval);
        }
    }

    /**
     * starting communication with device from config.
     * @returns {Promise<boolean>}
     */
    async start() : Promise<boolean> {
        //if device was already started -> stop it.
        //(use case: ip did change or settings did change)
        this.stop();

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
                    this.adapter.log.error(this.name + ' could not get settings: ' + e.stack);
                }
            }
        }

        //transfer enabled flag to object:
        await this.adapter.setStateAsync(this.id + Suffixes.enabled, {val: this.enabled, ack: true});

        //start polling if device is enabled (do this after all is setup).
        let result = false;
        if (this.enabled) {
            //some devices, for example W245, don't push.. so poll websocket also.
            let interval = this.pollInterval;
            if (interval !== undefined && !Number.isNaN(interval) && interval > 0) {
                this.adapter.log.debug('Start polling for ' + this.name + ' with interval ' + interval);
                result = true; //only use yellow/green states if polling at least one device.
                if (interval < 500) {
                    this.adapter.log.warn('Increasing poll rate to twice per second. Please check device config.');
                    interval = 500; //polling twice every second should be enough, right?
                }
                if (interval >= 2147483647) {
                    interval = 2147483646;
                    this.adapter.log.warn('Poll rate was too high, reduced to prevent issues.');
                }
                this.pollInterval = interval;
                this.intervalHandle = this.adapter.setTimeout(() => this.onInterval,
                    this.pollInterval);
            } else {
                this.pollInterval = 0;
                this.adapter.log.debug('Polling of ' + this.name + ' disabled, interval was ' + interval + ' (0 means disabled)');
            }
        }

        return result;
    }

    /**
     * process a state change. Device will just try to switch plug. Childs will have to overwrite this behaviour.
     * @param _id
     * @param _state
     */
    async handleStateChange(_id : string, _state : ioBroker.State) : Promise<void> {
        if (this.loggedIn) {
            await this.login();
        }
    }

}

