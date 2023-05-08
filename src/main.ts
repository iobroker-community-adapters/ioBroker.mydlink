/*
 * Created with @iobroker/create-adapter v2.2.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';

import {Device} from './lib/Device';
import { DeviceInfo } from './lib/DeviceInfo';
import { AutoDetector } from './lib/autoDetect';
import {TableDevice} from './lib/TableDevice';
import {createFromObject, createFromTable} from "./lib/DeviceFactory";

// Load your modules here, e.g.:
// import * as fs from "fs";

class Mydlink extends utils.Adapter {
    /**
     * Array of devices.
     *  Device consists of:
     *      config: which includes IP, PIN, ... set by the user
     *      client: soapclient for interaction with device
     * @type {Array<Device>}
     */
    devices: Array<Device> = [];

    /**
     * Store devices here, that we only have information from, but can not yet talk to.
     * Especially if model is missing, and we currently can not retrieve it (because device not online)
     * This will happen.
     */
    unidentifiedDevices: Array<DeviceInfo> = [];

    /**
     * Auto-detected devices. Store here and aggregate until we are sure it is mydlink and have mac
     *  -> multiple messages.
     * @type {{}}
     */
    detectedDevices : Record<string, any> = {};

    autoDetector: AutoDetector | undefined = undefined;

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'mydlink',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * deletes all objects of an device and the device itself (deleteDeviceAsync does not work somehow...?)
     * @param {Device} device
     */
    async deleteDeviceFull(device: Device) {
        //stop device:
        device.stop();

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
        } catch (e: any) {
            this.log.error('Error during deletion of ' + device.id + ': ' + e.stack);
        }
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private async onReady(): Promise<void> {
        // Initialize your adapter here

        //get secret for decryption:
        const systemConfig = await this.getForeignObjectAsync('system.config');
        if (systemConfig) {
            DeviceInfo.setSecret(systemConfig.native ? systemConfig.native.secret : 'RJaeBLRPwvPfh5O'); //fallback in case or for old installations without secret.
        }

        // Reset the connection indicator during startup
        this.setState('info.connection', false, true);

        //start auto detection:
        this.autoDetector = new AutoDetector(this);

        //start existing devices:
        let haveActiveDevices = false;
        const existingDevices = await this.getDevicesAsync();
        const configDevicesToAdd = [].concat(this.config.devices) as TableDevice[];
        this.log.debug('Got existing devices: ' + JSON.stringify(existingDevices, null, 2));
        this.log.debug('Got config devices: ' + JSON.stringify(configDevicesToAdd, null, 2));
        let needUpdateConfig = false;
        for (const existingDevice of existingDevices) {
            let found = false;
            for (const configDevice of this.config.devices as TableDevice[]) {
                needUpdateConfig = !configDevice.mac;
                if ((configDevice.mac && configDevice.mac === existingDevice.native.mac) ||
                    (!configDevice.mac && configDevice.ip === existingDevice.native.ip)) {
                    found = true;

                    //copy all data from config, because now only config is changed from config dialog.
                    for (const key of Object.keys(configDevice)) {
                        existingDevice.native[key] = configDevice[key]; //copy all fields.
                    }
                    existingDevice.native.pinNotEncrypted = !configDevice.mac;

                    configDevicesToAdd.splice(configDevicesToAdd.indexOf(configDevice), 1);
                    break; //break on first copy -> will remove additional copies later.
                }
            }
            const device = await createFromObject(this, existingDevice);
            await device.createDeviceObject(); //store new config.
            if (existingDevice.native.pinNotEncrypted) {
                needUpdateConfig = true;
            }
            if (found) {
                haveActiveDevices = await device.start() || haveActiveDevices;
                //keep config and client for later reference.
                this.devices.push(device);
            } else {
                this.log.debug('Deleting ' + device.name);
                await this.deleteDeviceFull(device);
            }
        }

        //add non-existing devices from config:
        for (const configDevice of configDevicesToAdd) {
            const device = await createFromTable(this, configDevice, !configDevice.pinNotEncrypted);
            this.log.debug('Device ' + device.name + ' in config but not in devices -> create and add.');
            const oldDevice = this.devices.find(d => d.mac === device.mac);
            if (oldDevice) {
                this.log.info('Duplicate entry for ' + device.mac + ' in config. Trying to rectify. Restart will happen. Affected devices: ' + device.name + ' === ' + configDevice.name);
                needUpdateConfig = true;
            } else {
                //make sure objects are created:
                await device.createDeviceObject();

                haveActiveDevices = await device.start() || haveActiveDevices;
                //call this here again, to make sure it happens.
                await device.createDeviceObject(); //store device settings
                //keep config and client for later reference.
                this.devices.push(device);
            }
        }

        //try to update config:
        if (needUpdateConfig) {
            const devices = [];
            for (const device of this.devices) {
                const configDevice = {
                    ip: device.ip,
                    mac: device.mac,
                    pin: device.pinEncrypted,
                    pollInterval: device.pollInterval,
                    enabled: device.enabled,
                    name: device.name,
                    model: device.model,
                    useWebSocket: device.isWebsocket
                };
                devices.push(configDevice);
            }
            await this.extendForeignObjectAsync('system.adapter.' + this.namespace, {
                native: {
                    devices: devices
                }
            });
        }

        await this.setStateChangedAsync('info.connection', !haveActiveDevices, true); //if no active device -> make green.
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    private onUnload(callback: () => void): void {
        try {
            this.log.debug('Stop polling');
            for (const device of this.devices) {
                device.stop();
            }
            if (this.autoDetector) {
                this.autoDetector.close();
            }

            this.log.info('cleaned everything up...');
            callback();
        } catch (e) {
            callback();
        }
    }

    /**
     * Is called if a subscribed state changes
     */
    private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
        if (state) { //ignore delete state
            // The state was changed
            this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);

            //only act if ack = false.
            if (state.ack === false) {
                const deviceId = id.split('.')[2]; //0 = adapter, 1 = instance -> 2 = device id.
                const device = this.devices.find(d => d.id === deviceId);
                if (device) {
                    await device.handleStateChange(id, state);
                } else {
                    this.log.info(`Unknown device ${deviceId} for ${id}. Can't control anything.`);
                }
            }
        }
    }

    // If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
    // /**
    //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
    //  * Using this method requires "common.messagebox" property to be set to true in io-package.json
    //  */
    private async onMessage(obj: ioBroker.Message) : Promise<void> {
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
                    const tableDevices = [];
                    for (const device of this.devices)  {
                        const tableDevice = {
                            name: device.name,
                            mac: device.mac,
                            ip: device.ip,
                            pin: device.pinDecrypted,
                            pollInterval: device.pollInterval,
                            enabled: device.enabled
                        };
                        tableDevices.push(tableDevice);
                    }
                    if (obj.callback) {
                        this.sendTo(obj.from, obj.command, tableDevices, obj.callback);
                    }
                    break;
                }
                case 'identifyDevice': {
                    const params = (obj.message) as Record<string, any>;
                    if (params && params.ip && params.pin) {
                        let device = await createFromTable(this, {
                            ip: params.ip,
                            pin: params.pin
                        });
                        try {
                            await device.start();
                            if (device.loggedIn && device.identified) { //will be false if ip wrong or duplicate mac.
                                const oldDevice = this.devices.find(d => d.mac === device.mac);
                                if (oldDevice) {
                                    device.stop();
                                    device = oldDevice;
                                } else {
                                    this.devices.push(device);
                                }
                                const sendDevice = {
                                    mac: device.mac,
                                    name: device.name,
                                    ip: device.ip,
                                    pollInterval: device.pollInterval,
                                    pin: device.pinDecrypted,
                                    enabled: device.loggedIn && device.identified
                                };
                                if (obj.callback) {
                                    this.sendTo(obj.from, obj.command, sendDevice, obj.callback);
                                }
                            } else {
                                this.log.info('could not login -> error.');
                                this.sendTo(obj.from, obj.command, 'ERROR', obj.callback);
                            }
                        } catch (e : any) {
                            this.log.info('could not login device: ' + e.stack);
                            if (obj.callback) {
                                this.sendTo(obj.from, obj.command, 'ERROR', obj.callback);
                            }
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
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new Mydlink(options);
} else {
    // otherwise start the instance directly
    (() => new Mydlink())();
}