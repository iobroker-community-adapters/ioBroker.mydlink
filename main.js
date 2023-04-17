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
