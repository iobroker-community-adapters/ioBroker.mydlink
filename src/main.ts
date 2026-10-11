/*
 * Created with @iobroker/create-adapter v2.2.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';
import { join } from 'node:path';

import type { Device } from './lib/Device';
import { AutoDetector } from './lib/autoDetect';
import type { TableDevice } from './lib/TableDevice';
import { normalizeMac, sanitizeTableDevice } from './lib/TableDevice';
import { createDevice, createFromTable } from './lib/DeviceFactory';
import { MydlinkDeviceManagement } from './lib/DeviceManagement';
import type { MydlinkConfig } from './lib/Config';
import {
    CONFIG_VERSION,
    deviceToTableDevice,
    LEGACY_SECRET,
    migrateLegacyDevices,
    sameTableDevices,
} from './lib/Config';

// Load your modules here, e.g.:
// import * as fs from "node:fs";

class Mydlink extends utils.Adapter {
    /**
     * Array of devices.
     * Device consists of:
     * config: which includes IP, PIN, ... set by the user
     * client: soapclient for interaction with device
     *
     */
    devices: Array<Device> = [];

    /**
     * Devices of the instance configuration, PINs decrypted.
     */
    configDevices: TableDevice[] = [];

    /**
     * Auto-detected devices. Store here and aggregate until we are sure it is mydlink and have mac
     * -> multiple messages.
     *
     */
    autoDetector: AutoDetector | undefined = undefined;

    /**
     * Set during unload, prevents devices from starting new timers.
     */
    unloading = false;

    /**
     * Communication with the device manager in admin.
     */
    readonly deviceManagement: MydlinkDeviceManagement;

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'mydlink',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
        this.deviceManagement = new MydlinkDeviceManagement(this);
    }

    /**
     * deletes all objects of a device and the device itself (deleteDeviceAsync does not work somehow...?)
     *
     * @param device device to delete
     */
    async deleteDeviceFull(device: Device): Promise<void> {
        //stop device:
        device.stop();
        await this.deleteDeviceObjects(device.id, device.mac);
    }

    /**
     * deletes all objects of a device id
     *
     * @param id id of the device object (MAC without colons)
     * @param mac MAC of the device
     */
    private async deleteDeviceObjects(id: string, mac: string): Promise<void> {
        //devices that were never identified have no id and no objects. Empty id would match all objects.
        if (!id) {
            return;
        }
        //check if detected device:
        if (this.autoDetector) {
            for (const ip of Object.keys(this.autoDetector.detectedDevices)) {
                const dectDevice = this.autoDetector.detectedDevices[ip];
                if (dectDevice.mac === mac) {
                    dectDevice.alreadyPresent = false;
                }
            }
        }

        try {
            const ids = await this.getObjectListAsync({
                startkey: `${this.namespace}.${id}`,
                endkey: `${this.namespace}.${id}\u9999`,
            });
            if (ids) {
                for (const obj of ids.rows) {
                    await this.delObjectAsync(obj.value._id);
                }
            }
        } catch (e: any) {
            this.log.error(`Error during deletion of ${id}: ${e.stack}`);
        }
    }

    /**
     * Stores the devices in the instance configuration. js-controller encrypts the PINs and restarts the adapter.
     *
     * @param devices devices with PINs in plain text
     */
    async saveConfigDevices(devices: TableDevice[]): Promise<void> {
        //updateConfig encrypts the PINs in place -> hand over copies.
        const copies = devices.map(device => ({ ...device }));
        this.configDevices = devices;
        await this.updateConfig({ configVersion: CONFIG_VERSION, devices: copies });
    }

    /**
     * Store new IP of a device in config. Changing the config restarts the adapter.
     *
     * @param mac MAC of the device
     * @param ip new IP
     */
    async updateDeviceIp(mac: string, ip: string): Promise<void> {
        const configDevice = this.configDevices.find(d => d.mac && normalizeMac(d.mac) === mac);
        if (configDevice && configDevice.ip !== ip) {
            await this.saveConfigDevices(this.configDevices.map(d => (d === configDevice ? { ...d, ip } : d)));
        }
    }

    /**
     * Logs in to a device and identifies it. Used to add a new device.
     *
     * @param ip IP of the device
     * @param pin PIN of the device
     * @returns identified device (stopped) or undefined, if login or identification failed
     */
    async identifyDevice(ip: string, pin: string): Promise<Device | undefined> {
        const device = await createFromTable(this, { ip, pin });
        if (!device) {
            return undefined;
        }
        try {
            await device.start();
            if (device.loggedIn && device.identified && device.mac) {
                return device;
            }
            this.log.info(`Could not log in to device on ${ip}.`);
        } catch (e: any) {
            this.log.info(`Could not log in to device on ${ip}: ${e.stack}`);
        } finally {
            //configuration is stored and adapter restarts -> no need to keep it running.
            device.stop();
        }
        return undefined;
    }

    /**
     * Reads the devices from the instance configuration with decrypted PINs.
     * Converts configurations of old versions, which encrypted the PINs themselves.
     *
     * @returns devices or undefined, if the configuration was converted. The adapter restarts then.
     */
    private async loadConfigDevices(): Promise<TableDevice[] | undefined> {
        const config = this.config as MydlinkConfig;
        if (config.configVersion !== CONFIG_VERSION) {
            const devices = await this.migrateConfig();
            if (devices.length) {
                this.log.info(
                    'Converted configuration, PINs are now encrypted by js-controller. Adapter will restart.',
                );
                await this.saveConfigDevices(devices);
                return undefined;
            }
            return devices;
        }

        const devices = (config.devices || []).map(device => ({ ...device }));
        let pins: string | string[] | void = [];
        try {
            pins = await this.getEncryptedConfig('devices.pin');
        } catch (e: any) {
            this.log.error(`Could not decrypt PINs: ${e}`);
        }
        devices.forEach((device, index) => {
            const pin = Array.isArray(pins) ? pins[index] : undefined;
            device.pin = typeof pin === 'string' ? pin : '';
        });
        return devices;
    }

    /**
     * Reads devices of a configuration of version 1 from the instance object. this.config can not be used, because
     * js-controller might have tried to decrypt PINs that were not encrypted.
     * Also removes the PINs old versions stored in the device objects.
     *
     * @returns devices with decrypted PINs
     */
    private async migrateConfig(): Promise<TableDevice[]> {
        for (const deviceObject of await this.getDevicesAsync()) {
            if ('pin' in deviceObject.native || 'pinNotEncrypted' in deviceObject.native) {
                delete deviceObject.native.pin;
                delete deviceObject.native.pinNotEncrypted;
                await this.setForeignObjectAsync(deviceObject._id, deviceObject);
            }
        }

        const instanceObject = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
        const devices = (instanceObject?.native.devices || []) as TableDevice[];
        if (!devices.length) {
            return [];
        }
        const systemConfig = await this.getForeignObjectAsync('system.config');
        //fallback for old installations without secret, like old versions did.
        const secret = systemConfig?.native?.secret || LEGACY_SECRET;
        return migrateLegacyDevices(devices, secret);
    }

    /**
     * Creates device of a configuration entry. Devices with known model are created without login.
     *
     * @param configDevice entry of the configuration
     * @param deviceObjects existing device objects, to get the model if missing in the configuration
     * @returns device or undefined, if creation failed
     */
    private async createConfiguredDevice(
        configDevice: TableDevice,
        deviceObjects: ioBroker.DeviceObject[],
    ): Promise<Device | undefined> {
        const deviceObject = configDevice.mac
            ? deviceObjects.find(o => o.native.mac && normalizeMac(o.native.mac) === configDevice.mac)
            : undefined;
        const model = configDevice.model || deviceObject?.native.model;
        const useWebSocket = configDevice.useWebSocket ?? deviceObject?.native.useWebSocket;
        if (configDevice.mac && model) {
            return createDevice(this, {
                ip: configDevice.ip,
                pin: configDevice.pin,
                model,
                pollInterval: Number(configDevice.pollInterval),
                mac: configDevice.mac,
                name: configDevice.name,
                enabled: configDevice.enabled,
                isWebsocket: useWebSocket,
            });
        }
        this.log.info(`Model still unknown for ${configDevice.name || configDevice.ip}. Trying to identify.`);
        return createFromTable(this, configDevice, useWebSocket);
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private async onReady(): Promise<void> {
        //texts for the device manager:
        await utils.I18n.init(join(__dirname, '..', 'admin'), this);

        // Reset the connection indicator during startup
        await this.delObjectAsync('info', { recursive: true });

        const configDevices = await this.loadConfigDevices();
        if (!configDevices) {
            return; //configuration converted, restart follows.
        }
        this.configDevices = configDevices;

        //start auto detection:
        this.autoDetector = new AutoDetector(this);

        const deviceObjects = await this.getDevicesAsync();
        this.log.debug(`Got existing devices: ${JSON.stringify(deviceObjects, null, 2)}`);
        this.log.debug(`Got ${configDevices.length} config devices.`);

        for (const configDevice of configDevices.map(d => ({ ...d }))) {
            sanitizeTableDevice(configDevice);
            const device = await this.createConfiguredDevice(configDevice, deviceObjects);
            if (!device) {
                this.log.error(`Could not create device for config entry with IP: ${configDevice.ip}`);
                continue;
            }
            if (device.mac && this.devices.some(d => d.mac === device.mac)) {
                device.stop();
                this.log.info(
                    `Duplicate entry for ${device.mac} in config. Trying to rectify. Restart will happen. Affected devices: ${device.name} === ${configDevice.name}`,
                );
                continue;
            }
            //make sure objects are created:
            await device.createDeviceObject();
            await device.start();
            //call this here again, to make sure it happens.
            await device.createDeviceObject(); //store device settings
            //keep config and client for later reference.
            this.devices.push(device);
        }

        //delete objects of devices no longer in config:
        for (const deviceObject of deviceObjects) {
            const id = deviceObject._id.split('.')[2];
            if (!this.devices.some(d => d.id === id)) {
                this.log.debug(`Deleting ${deviceObject.common.name as string}`);
                await this.deleteDeviceObjects(id, deviceObject.native.mac);
            }
        }

        //devices answering the first query were not started yet -> query again to detect changed IPs.
        this.autoDetector.query();

        //store identified MAC, model, normalized MAC or removed duplicates in config:
        const devices = this.devices.map(deviceToTableDevice);
        if (!sameTableDevices(devices, configDevices)) {
            await this.saveConfigDevices(devices);
        }
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param callback function to call when cleanup is done
     */
    private onUnload(callback: () => void): void {
        this.unloading = true;
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
        } catch (e: any) {
            this.log.error(`Error during unload: ${e}`);
            callback();
        }
    }

    /**
     * Is called if a subscribed state changes
     *
     * @param id id of changed state object
     * @param state changed state
     */
    private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
        if (state) {
            //ignore delete state
            // The state was changed
            this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);

            //only act if ack = false.
            if (!state.ack) {
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
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new Mydlink(options);
} else {
    // otherwise start the instance directly
    (() => new Mydlink())();
}
