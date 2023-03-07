import { Client } from './Clients';
import { DeviceInfo } from './DeviceInfo';
import { Suffixes } from './suffixes';
import {Mydlink} from '../main';

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

export abstract class Device extends  DeviceInfo {
    readonly adapter: Mydlink;
    abstract client: Client;
    constructor (adapter : Mydlink, ip : string, pin: string, pinEncrypted: boolean) {
        super(ip, pin, pinEncrypted);
        this.adapter = adapter;
    }

    /**
     * Create DeviceInfo from ioBroker object, old createDeviceFromConfig
     * @param adapter ioBroker Adapter
     * @param configDevice ioBroker device object
     * @returns Device
     */
    static createFromObject<Type extends Device>(this: { new(adapter : ioBroker.Adapter, ip : string, pin: string, pinEncrypted: boolean): Type },
        adapter : ioBroker.Adapter, configDevice: ioBroker.DeviceObject) : Type {

        const native = configDevice.native;
        const pinEncrypted = (native.mac && !native.pinNotEncrypted);
        const device = new this(adapter, native.ip, native.pin, pinEncrypted);
        device.pollInterval = native.pollInterval;
        device.mac = native.mac ? native.mac.toUpperCase() : '';
        device.id = configDevice._id.split('.')[2];
        device.name = native.name;
        device.model = native.model || '';
        device.enabled = native.enabled;
        //TODO: native has "useWebsocket" -> how to handle this here? Hm..
        device.isWebsocket = native.useWebsocket;
        return device;
    }

    /**
     * Creates DeviceInfo from configuration-Table object.
     * @param adapter ioBroker Adapter
     * @param tableDevice
     * @param doDecrypt
     * @returns Device
     */
    static createFromTable<Type extends Device>(this: { new(adapter : ioBroker.Adapter, ip : string, pin: string, pinEncrypted: boolean): Type },
        adapter : ioBroker.Adapter, tableDevice: { pin: string, ip: string, pollInterval: undefined | number | string, mac: undefined | string, name: string, enabled: boolean}, doDecrypt = false) : Type {
        const pinEncrypted = (doDecrypt && Boolean(tableDevice.mac));
        const device = new this(adapter, tableDevice.ip, tableDevice.pin, pinEncrypted);
        device.pollInterval = tableDevice.pollInterval !== undefined && isFinite(Number(tableDevice.pollInterval)) && tableDevice.pollInterval >= 0 ? Number(tableDevice.pollInterval) : 30000;
        device.mac = tableDevice.mac ? tableDevice.mac.toUpperCase() : '';
        tableDevice.mac ? device.idFromMac() : '';
        device.name = tableDevice.name;
        device.enabled = tableDevice.enabled;
        return device;
    }

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
                name: this.name
            },
            native: {
                ip: this.ip,
                mac: this.mac,
                pin: this.pinEncrypted,
                pollInterval: this.pollInterval,
                enabled: this.enabled,
                name: this.name,
                model: this.model,
                useWebSocket: this.isWebsocket
            }
        });
    }

    stop() {
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
        }
        if (this.client && typeof this.client.disconnect === 'function') {
            this.client.disconnect();
        }
        this.ready = false;
        this.loggedIn = false;
    }

    async login() {
        //TODO!
    }

    async identify() {
        //TODO!
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
                this.ready = this.client.isDeviceReady();
                await this.adapter.setStateAsync(this.id + Suffixes.unreachable, !this.ready, true);

                //prevent more interaction with device and reset connection.
                if (this.ready) {
                    //signal that we could at least reach one device:
                    await this.adapter.setStateChangedAsync('info.connection', true, true);
                }
            }
        } catch (e: any) {
            const code = processNetworkError(e);
            if (code === 403 || this.ready) {
                this.loggedIn = false; //login next polling.
            }
            this.adapter.log.debug('Error during polling ' + this.name + ': ' + code + ' - ' + e.stack + ' - ' + e.body);
            this.ready = false;
            await this.adapter.setStateChangedAsync(this.id + Suffixes.unreachable, true, true);

            let connected = false;
            this.adapter.devices.forEach((device) => { connected = connected || device.ready; }); //turn green if at least one device is ready = reachable.
            await this.adapter.setStateChangedAsync('info.connection', connected, true);
        }

        this.intervalHandle = setTimeout(() => this.onInterval,
            this.pollInterval);
    }

    /**
     * starting communication with device from config.
     * @returns {Promise<boolean>}
     */
    async start() {
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
                this.intervalHandle = setTimeout(() => this.onInterval,
                    this.pollInterval);
            } else {
                this.adapter.log.debug('Polling of ' + this.name + ' disabled, interval was ' + interval + ' (0 means disabled)');
            }
        }

        return result;
    }
}

