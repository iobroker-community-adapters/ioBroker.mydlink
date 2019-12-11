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
 * Created with @iobroker/create-adapter v1.17.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");

// Load your modules here, e.g.:
// const fs = require("fs");
const createSoapClient = require("./lib/soapclient.js");

const readySuffix = ".ready";
const enabledSuffix = ".enabled";
const stateSuffix = ".state";
const powerSuffix = ".currentPower";
const totalPowerSuffix = ".totalPower";
const temperatureSuffix = ".temperature";
const lastDetectedSuffix = ".lastDetected";
const noMotionSuffix = ".no_motion";

class DlinkSmarhome extends utils.Adapter {
    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: 'mydlink',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('objectChange', this.onObjectChange.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        // this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));

        /**
         * Array of devices.
         *  Device consists of:
         *      config: which includes IP, PIN, ... set by the user
         *      client: soapclient for interaction with device
         * @type {Array}
         */
        this.devices = [];
    }

    /**
     * Create states for new devices, ie devices that came from config but did not have a device created, yet.
     * @param device
     * @returns {Promise<void>}
     */
    async createNewDevice(device) {
        //also set the native part of the device:
        await this.createDeviceAsync(device.name, {name: device.name}, device);
        //create state object, for plug this is writable for sensor not.
        await this.setObjectAsync(device.name + stateSuffix, {
            type: 'state',
            common: {
                name: 'state',
                type: 'boolean',
                role: 'switch',
                read: true,
                write: true
            },
            native: {}
        });
        await this.setObjectAsync(device.name + enabledSuffix, {
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
    }

    /**
     * Creates objects based on flags on device. IE for W215 also temperature and power measurement.
     * @param device
     * @returns {Promise<void>}
     */
    async createObjects(device) {
        if(device.hasTemp) {
            this.log.debug("Creating temp object for " + device.name);
            await this.setObjectAsync(device.name + temperatureSuffix, {
                type: 'state',
                common: {
                    name: 'temperature',
                    type: 'number',
                    role: 'value.temperature',
                    unit: "°C",
                    read: true,
                    write: false
                },
                native: {}
            });
        }
        if (device.hasPower) {
            this.log.debug("Creating power object for " + device.name);
            await this.setObjectAsync(device.name + powerSuffix, {
                type: 'state',
                common: {
                    name: 'currentPowerConsumption',
                    type: 'number',
                    role: 'value.power.consumption',
                    unit: "Wh",
                    read: true,
                    write: false
                },
                native: {}
            });
        }
        if (device.hasTotalPower) {
            this.log.debug("Creating totalPower object for " + device.name);
            await this.setObjectAsync(device.name + totalPowerSuffix, {
                type: 'state',
                common: {
                    name: 'totalPowerConsumption',
                    type: 'number',
                    role: 'value.power.consumption',
                    unit: "kWh",
                    read: true,
                    write: false
                },
                native: {}
            });
        }
        if (device.hasLastDetected) {
            this.log.debug("Creating lastDetected object for " + device.name);
            await this.setObjectAsync(device.name + lastDetectedSuffix, {
                type: 'state',
                common: {
                    name: 'lastDetected',
                    type: 'number',
                    role: 'value.time',
                    read: true,
                    write: false
                },
                native: {}
            });

            this.log.debug("Creating no_motion object for " + device.name);
            await this.setObjectAsync(device.name + noMotionSuffix, {
                type: 'state',
                common: {
                    name: 'No motion since',
                    type: 'number',
                    role: 'value.interval',
                    unit: "seconds",
                    read: true,
                    write: false
                },
                native: {}
            });
        }

        if (!device.canSwitchOnOff) {
            this.log.debug("Changing state to indicator for " + device.name);
            await this.setObjectAsync(device.name + stateSuffix, {
                type: 'state',
                common: {
                    name: 'state',
                    type: 'boolean',
                    role: 'indicator',
                    read: true,
                    write: false
                },
                native: {}
            });
        } else {
            await this.subscribeStatesAsync(device.name + stateSuffix);
        }

        //have ready indicator:
        await this.setObjectAsync(device.name + readySuffix, {
            type: 'state',
            common: {
                name: "ready",
                type: "number",
                role: "indicator",
                read: true,
                write: false
            },
            native: {}
        });
    }

    /**
     * Reads settings from device and sets flags for object creation and polling.
     * @param device
     * @returns {Promise<*>}
     */
    async identifyDevice(device) {
        //get device settings, which returns modelname and firmware version. So we know what states to create.
        let settings = await device.client.getDeviceSettings();
        this.log.debug(device.name + " returned following device settings: " + JSON.stringify(settings, null, 2));
        device.model = settings.ModelName;

        let soapactions = await device.client.getModuleSOAPActions(0);
        this.log.debug("Module SOAP Actions: " + JSON.stringify(soapactions, null, 2));

        switch(device.model) {
            case "DSP-W215":
                device.canSwitchOnOff = true;
                device.hasTemp = true;
                device.hasPower = true;
                device.hasTotalPower = true;
                device.hasLastDetected = false;
                break;
            case "DCH-S150":
                device.canSwitchOnOff = false;
                device.hasTemp = false;
                device.hasPower = false;
                device.hasTotalPower = false;
                device.hasLastDetected = true;
                break;
            default:
                device.canSwitchOnOff = (settings.ModelDescription.indexOf("Socket") >= 0); //if is socket, probably can switch on/off.
                device.hasTemp = false;
                device.hasPower = false;
                device.hasTotalPower = false;
                device.hasLastDetected = false;
                break;
        }
        await this.createObjects(device);
        device.identified = true;
        return device;
    }

    /**
     * Starts log in for device. Needs to be done before additional commands can work.
     * @param device
     * @returns {Promise<boolean>}
     */
    async loginDevice(device) {
        try {
            let loginResult = await device.client.login();
            this.log.debug(device.name + " successfully logged in. " + JSON.stringify(loginResult));
            device.loggedIn = true;
        } catch (e) {
            device.loggedIn = false;
            this.log.debug("Login error: " +  JSON.stringify(e, null, 2));
            this.log.error(device.name + " could not login. Please check credentials and if device is online/connected. Error: " + JSON.stringify(e, null, 2));
        }
        return device.loggedIn;
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Initialize your adapter here

        // The adapters config (in the instance object everything under the attribute "native") is accessible via
        // this.config:
        //ie array devices with device objects.
        //and polling time = interval
        this.log.debug('polling interval: ' + this.config.interval);
        this.log.debug('devices: ' + JSON.stringify(this.config.devices, null, 2));

        //compare existing and configured devices:
        let existingDevices = await this.getDevicesAsync();
        this.log.debug("Got devices: " + JSON.stringify(existingDevices, null, 2));
        for (const device of this.config.devices) {
            this.log.debug("Processing " + device.name);
            let id = "mydlink." + this.instance + "." + device.name;

            //search for configured device in existing devices.
            let found = false;
            for (let i = existingDevices.length - 1; i >= 0; i -= 1) {
                if (existingDevices[i]._id === id) {
                    this.log.debug("Device " + device.name + " already exists. Do not create.");
                    //remove from existing devices.
                    existingDevices.splice(i, 1);
                    found = true;
                    break;
                }
            }
            if (!found) {
                this.log.debug("Device " + device.name + " new. Create device.");
                await this.createNewDevice(device);
            }

            //transfer enabled flag to object:
            await this.setStateAsync(device.name + enabledSuffix, { val: device.enabled, ack: true });

            //do this for every enabled device, ignore not enabled devices:
            if (device.enabled) {
                //create the soapclient
                let client = createSoapClient({
                    user: "Admin",
                    password: device.pin,
                    url: "http://" + device.ip + "/HNAP1"
                }); //no https, sadly.

                //keep config and client for later reference.
                let internalDevice = {
                    config: device,
                    client: client,
                    id: id, //for easier state updates
                    name: device.name, //for easier logging
                    loggedIn: false,
                    identified: false
                };
                this.devices.push(internalDevice);

                let interval = Number.parseInt(device.pollInterval || this.config.interval);
                if (!Number.isNaN(interval) && interval !== 0) {
                    this.log.debug("Start polling for " + device.name);
                    if (interval < 500) {
                        this.log.warn("Increasing poll rate to twice per second. Please check device config.");
                        interval = 500; //polling once every second should be enough, right?
                    }
                    internalDevice.interval = setInterval(this.onInterval.bind(this, internalDevice), interval);
                } else {
                    this.log.debug("Polling disabled, interval was " + interval + " from " + device.pollInterval + " and " + this.config.interval);
                }

                //login:
                await this.loginDevice(internalDevice);

                if (internalDevice.loggedIn) {
                    try {
                        await this.identifyDevice(internalDevice);
                    } catch (e) {
                        this.log.error(device.name + " could not get settings: " +  + JSON.stringify(e, null, 2));
                    }
                }
            }
        }//processing devices for the first time

        for (const oldDevice of existingDevices) {
            this.log.debug(oldDevice.native.name + " not in config anymore. Delete objects.");
            await this.deleteDeviceAsync(oldDevice.native.name);
        }
    }

    /**
     * Poll a value, compare it to the value already set and if different, set value in DB.
     * @param pollFunc - function to use for polling
     * @param id - state Id
     * @returns {Promise<boolean>} //true if change did happen.
     */
    async pollAndSetState(pollFunc, id) {
        let value = await pollFunc();
        if (value === "OK") {
            value = true; //for ready
        }
        if (value === "ERROR") {
            //something went wrong... maybe can not read that setting at all?
            throw "Error during reading " + id;
        }

        let result = await this.setStateChangedAsync(id, value, true);
        // @ts-ignore
        return !result.notChanged;
    }

    /**
     * Do polling here.
     * @param device
     * @returns {Promise<void>}
     */
    async onInterval(device) {
        //this.log.debug("Polling " + device.name);
        try {
            if (!device.loggedIn) {
                let result = await this.loginDevice(device);
                if (!result) {
                    return;
                }
            }
            if (!device.identified) {
                await this.identifyDevice(device);
            }
            await this.pollAndSetState(device.client.isDeviceReady, device.id + readySuffix);
            if (device.canSwitchOnOff) {
                await this.pollAndSetState(device.client.state, device.id + stateSuffix);
            }
            if (device.hasLastDetected) {
                let detectionHappened = await this.pollAndSetState(device.client.lastDetection, device.id + lastDetectedSuffix);
                if (detectionHappened) {
                    //always set state to true, for new detections.
                    await this.setStateAsync(device.id + stateSuffix, detectionHappened, true);
                } else {
                    await this.setStateChangedAsync(device.id + stateSuffix, false, true);
                }

                //fill no detection variable:
                let lastDetection = await this.getStateAsync(device.id + lastDetectedSuffix);
                if (lastDetection) {
                    let noMotion = Math.round((Date.now() - lastDetection.val) / 1000);
                    await this.setStateChangedAsync(device.id + noMotionSuffix, noMotion, true);
                }
            }
            if (device.hasTemp) {
                await this.pollAndSetState(device.client.temperature, device.id + temperatureSuffix);
            }
            if (device.hasPower) {
                await this.pollAndSetState(device.client.consumption, device.id + powerSuffix);
            }
            if (device.hasTotalPower) {
                await this.pollAndSetState(device.client.totalConsumption, device.id + totalPowerSuffix);
            }
            //this.log.debug("Polling of " + device.name + " finished.");
        } catch (e) {
            this.log.error("Error during polling " + device.name + ": " + JSON.stringify(e, null, 2));
            if (e.errno === 403) {
                device.loggedIn = false; //login next polling.
            }
            await this.setStateAsync(device.id + readySuffix, false, true);
        }
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            this.log.debug("Stop polling");
            for (const device of this.devices) {
                if (device.interval) {
                    clearInterval(device.interval);
                }
            }

            this.log.info('cleaned everything up...');
            callback();
        } catch (e) {
            callback();
        }
    }

    /**
     * Is called if a subscribed object changes
     * @param {string} id
     * @param {ioBroker.Object | null | undefined} obj
     */
    onObjectChange(id, obj) {
        if (obj) {
            // The object was changed
            this.log.info("object " + id + " changed: " + JSON.stringify(obj, null, 2));
        } else {
            // The object was deleted
            this.log.info(`object ${id} deleted`);
        }
    }

    /**
     * Is called if a subscribed state changes
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    async onStateChange(id, state) {
        if (state) {
            // The state was changed
            this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        } else {
            // The state was deleted
            this.log.debug(`state ${id} deleted`);
            return;
        }

        //only react to commands:
        if (state.ack === false) {
            //find devices:
            for (const device of this.devices) {
                let devId = device.id + stateSuffix;
                if (id === devId) {
                    //found device:
                    this.log.debug("Found device to switch.");
                    let switchFunc = device.client.off;
                    if (state.val) {
                        switchFunc = device.client.on;
                    }

                    try {
                        await switchFunc();
                        this.log.debug("Switched " + device.name + (state.val ? " on." : " off."));
                        await this.pollAndSetState(device.client.state, device.id + stateSuffix);
                    } catch(e) {
                        this.log.error("Error while switching device " + device.name + ": " +  + JSON.stringify(e, null, 2));
                    }
                    break; //can stop loop.
                }
            }
        }
    }

    // /**
    //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
    //  * Using this method requires "common.message" property to be set to true in io-package.json
    //  * @param {ioBroker.Message} obj
    //  */
    // onMessage(obj) {
    // 	if (typeof obj === 'object' && obj.message) {
    // 		if (obj.command === 'send') {
    // 			// e.g. send email or pushover or whatever
    // 			this.log.info('send command');

    // 			// Send response in callback if required
    // 			if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
    // 		}
    // 	}
    // }

}

// @ts-ignore parent is a valid property on module
if (module.parent) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new DlinkSmarhome(options);
} else {
    // otherwise start the instance directly
    new DlinkSmarhome();
}
