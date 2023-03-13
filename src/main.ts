/*
 * Created with @iobroker/create-adapter v2.2.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';

import { DeviceInfo } from './lib/DeviceInfo';
import { Device } from './lib/Device';
import { AutoDetector } from './lib/autoDetect';

// Load your modules here, e.g.:
// import * as fs from "fs";

export class Mydlink extends utils.Adapter {
    /**
     * Array of devices.
     *  Device consists of:
     *      config: which includes IP, PIN, ... set by the user
     *      client: soapclient for interaction with device
     * @type {Array<Device>}
     */
    devices: Array<Device> = [];

    /**
     * Auto-detected devices. Store here and aggregate until we are sure it is mydlink and have mac
     *  -> multiple messages.
     * @type {{}}
     */
    detectedDevices = {};

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
    private async onStateChange(id: string, state: ioBroker.State | null | undefined): void {
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
    private onMessage(obj: ioBroker.Message): void {
        if (typeof obj === 'object' && obj.message) {
            if (obj.command === 'send') {
                // e.g. send email or pushover or whatever
                this.log.info('send command');

                // Send response in callback if required
                if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
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