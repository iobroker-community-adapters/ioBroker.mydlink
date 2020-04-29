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
 * Created with @iobroker/create-adapter v1.20.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');
const Mdns = require('mdns-discovery');
const deviceFlags = require('./lib/deviceFlags');

// Load your modules here, e.g.:
// const fs = require('fs');
const createSoapClient = require('./lib/soapclient.js');

const readySuffix = '.ready';
const enabledSuffix = '.enabled';
const stateSuffix = '.state';
const powerSuffix = '.currentPower';
const totalPowerSuffix = '.totalPower';
const temperatureSuffix = '.temperature';
const lastDetectedSuffix = '.lastDetected';
const noMotionSuffix = '.no_motion';

function decrypt(key, value) {
    let result = '';
    for (let i = 0; i < value.length; ++i) {
        result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
    }
    return result;
}
function encrypt(key, value) {
    let result = '';
    for (let i = 0; i < value.length; ++i) {
        result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
    }
    return result;
}

/**
 * create id from mac:
 * @param {string} mac
 */
function idFromMac(mac) {
    return mac.toUpperCase().replace(/:/g, '');
}

/**
 * @typedef DeviceConfig
 * @type {Object}
 * @property {string} model - model name of device
 */
/**
 * @typedef Device
 * @type {Object}
 * @property {object} client - soap client
 * @property {string} ip - device.ip,
 * @property {string} pin - device.pin,
 * @property {string} mac - mac address and id of device
 * @property {string} id - full object id of device (derived from mac)
 * @property {string} name - device.name, //for easier logging
 * @property {boolean} loggedIn - true if logged in
 * @property {boolean} identified - true if identified
 * @property {boolean} ready - true if logged in and ready to send / receive and online
 * @property {boolean} loginErrorPrinted - used to surpress repeating login errors.
 * @property {boolean} created - true if created in ioBroker (can only happen with mac)
 * @property {number} pollInterval configured pollInterval in milliseconds
 * @property {NodeJS.Timeout|undefined} intervalHandle handle of interval
 * @property {string} model Model name of hardware device
 * @property {Record<string, boolean>} flags determine what features the hardware has
 * @property {boolean} enabled true if device should be talked too.
 */

class DlinkSmarthome extends utils.Adapter {
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: 'mydlink',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('objectChange', this.onObjectChange.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
        this.secret = '';

        /**
         * Array of devices.
         *  Device consists of:
         *      config: which includes IP, PIN, ... set by the user
         *      client: soapclient for interaction with device
         * @type {Array<Device>}
         */
        this.devices = [];
        /**
         * Auto detected devices. Store here and aggregate until we are sure it is mydlink and have mac
         *  -> multiple messages.
         * @type {{}}
         */
        this.detectedDevices = {};
    }

    /**
     * Create states for new devices, ie devices that came from config but did not have a device created, yet.
     * @param {Device} device
     * @returns {Promise<void>}
     */
    async createNewDevice(device) {
        //also set the native part of the device:
        await this.createDeviceAsync(device.id, {name: device.name}, {
            ip: device.ip,
            mac: device.mac,
            pin: encrypt(this.secret, device.pin),
            pollInterval: device.pollInterval,
            enabled: device.enabled,
            name: device.name
        }, device);
        //create state object, for plug this is writable for sensor not.
        await this.setObjectNotExistsAsync(device.id + stateSuffix, {
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
        await this.setObjectNotExistsAsync(device.id + enabledSuffix, {
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
        if(device.flags.hasTemp) {
            this.log.debug('Creating temp object for ' + device.name);
            await this.setObjectNotExistsAsync(device.id + temperatureSuffix, {
                type: 'state',
                common: {
                    name: 'temperature',
                    type: 'number',
                    role: 'value.temperature',
                    unit: '°C',
                    read: true,
                    write: false
                },
                native: {}
            });
        }
        if (device.flags.hasPower) {
            this.log.debug('Creating power object for ' + device.name);
            await this.setObjectNotExistsAsync(device.id + powerSuffix, {
                type: 'state',
                common: {
                    name: 'currentPowerConsumption',
                    type: 'number',
                    role: 'value.power.consumption',
                    unit: 'Wh',
                    read: true,
                    write: false
                },
                native: {}
            });
        }
        if (device.flags.hasTotalPower) {
            this.log.debug('Creating totalPower object for ' + device.name);
            await this.setObjectNotExistsAsync(device.id + totalPowerSuffix, {
                type: 'state',
                common: {
                    name: 'totalPowerConsumption',
                    type: 'number',
                    role: 'value.power.consumption',
                    unit: 'kWh',
                    read: true,
                    write: false
                },
                native: {}
            });
        }
        if (device.flags.hasLastDetected) {
            this.log.debug('Creating lastDetected object for ' + device.name);
            await this.setObjectNotExistsAsync(device.id + lastDetectedSuffix, {
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

            this.log.debug('Creating no_motion object for ' + device.name);
            await this.setObjectNotExistsAsync(device.id + noMotionSuffix, {
                type: 'state',
                common: {
                    name: 'No motion since',
                    type: 'number',
                    role: 'value.interval',
                    unit: 'seconds',
                    read: true,
                    write: false
                },
                native: {}
            });
        }

        if (!device.flags.canSwitchOnOff) {
            this.log.debug('Changing state to indicator for ' + device.name);
            await this.extendObjectAsync(device.id + stateSuffix, {
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
            await this.subscribeStatesAsync(device.id + stateSuffix);
        }

        //have ready indicator:
        await this.setObjectNotExistsAsync(device.id + readySuffix, {
            type: 'state',
            common: {
                name: 'ready',
                type: 'number',
                role: 'indicator',
                read: true,
                write: false
            },
            native: {}
        });
    }

    /**
     * Reads settings from device and sets flags for object creation and polling.
     * @param {Device} device
     * @returns {Promise<*>}
     */
    async identifyDevice(device) {
        //get device settings, which returns model name and firmware version. So we know what states to create.
        const settings = await device.client.getDeviceSettings();
        this.log.debug(device.name + ' returned following device settings: ' + JSON.stringify(settings, null, 2));
        device.model = settings.ModelName;
        //check if device is present:
        const oldDevice = this.devices.find(d => d.mac === settings.DeviceMacId.toUpperCase());
        if (oldDevice) {
            this.log.warn('Device with MAC ' + oldDevice.mac + ' already present. Ignoring device ' + device.name);
            return false;
        }

        if (device.mac && device.mac !== settings.DeviceMacId) {
            this.log.warn('Device mac differs from stored mac for ' + device.name);
        } else {
            device.mac = settings.DeviceMacId.toUpperCase();
            //do that here to allow conversion from old devices.
            device.id = idFromMac(device.mac);
            // @ts-ignore
            device.pollInterval = device.pollInterval || this.config.pollInterval;
            await this.createNewDevice(device); //store device settings

            //delete old device:
            try {
                const ids = await this.getObjectListAsync({
                    startkey: device.name,
                    endkey: device.name + '\u9999'
                });
                if (ids) {
                    for (const obj of ids.rows) {
                        await this.delObjectAsync(obj.value._id);
                    }
                }
            } catch (e) {
                this.log.info('Could not delete old device ' + device.name + ', because: ' + e.stack);
            }
        }

        const flags = deviceFlags[device.model];
        if (flags) {
            device.flags = flags;
        } else {
            device.flags = {
                canSwitchOnOff: (settings.ModuleTypes.find(t => t.indexOf('Plug') >= 0)), //if is socket, probably can switch on/off
                hasTemp: false,
                hasPower: false,
                hasTotalPower: false,
                hasLastDetected: false
            };
            //report unknown device:
            const xmls = await device.client.getDeviceDescriptionXML();
            this.log.info('Found new device, please report the following (full log from file, please) to developer: ' + JSON.stringify(xmls, null, 2));
            if (this.supportsFeature && this.supportsFeature('PLUGINS')) {
                const sentryInstance = this.getPluginInstance('sentry');
                if (sentryInstance) {
                    const Sentry = sentryInstance.getSentryObject();
                    Sentry && Sentry.withScope(scope => {
                        scope.setLevel('info');
                        for (const key of Object.keys(xmls)) {
                            scope.setExtra(key, xmls[key]);
                        }
                        Sentry.captureMessage('Unknown-Device', 'info'); // Level 'info'
                    });
                } else {
                    this.log.error('No sentry plugin?');
                }
            } else {
                this.log.error('No plugin support, yet?');
            }
        }

        await this.createObjects(device);
        device.identified = true;
        return device;
    }

    /**
     * Starts log in for device. Needs to be done before additional commands can work.
     * @param {Device} device
     * @returns {Promise<boolean>}
     */
    async loginDevice(device) {
        try {
            const loginResult = await device.client.login();
            this.log.debug(device.name + ' successfully logged in. ' + JSON.stringify(loginResult));
            device.loggedIn = true;
            device.loginErrorPrinted = false;
        } catch (e) {
            if (!device.loginErrorPrinted) {
                this.log.debug('Login error: ' +  JSON.stringify(e, null, 2));
                this.log.error(device.name + ' could not login. Please check credentials and if device is online/connected. Error: ' + JSON.stringify(e, null, 2));
                device.loginErrorPrinted = true;
            }
            device.loggedIn = false;
        }
        return device.loggedIn;
    }

    /**
     *
     * @param {ioBroker.DeviceObject} configDevice
     * @returns {Device}
     */
    createDeviceFromConfig(configDevice) {
        this.log.debug('Processing ' + configDevice.common.name);
        const native = configDevice.native;

        //internal configuration:
        const device = {
            client: {}, //filled later
            ip: /** @type {string} */ (native.ip),
            pin: decrypt(this.secret, native.pin),
            pollInterval: /** @type {number} */ (native.pollInterval),
            mac: /** @type {string} */ (native.mac) ? /** @type {string} */ (native.mac).toUpperCase() : '',
            id: configDevice._id, //for easier state updates -> depents on MAC.
            name: configDevice.common.name, //for easier logging
            loggedIn: false,
            identified: false,
            ready: false,
            intervalHandle: undefined,
            loginErrorPrinted: false,
            created: true,
            model: '',
            flags: {},
            enabled: /** @type {boolean} */ (native.enabled)
        };

        return device;
    }

    /**
     *
     * @param {string} ip
     * @param {string} pin
     * @returns {Device}
     */
    createDeviceFromIpAndPin(ip, pin) {
        //internal configuration:
        const device = {
            client: {}, //filled later
            ip: ip,
            pin: pin,
            pollInterval: 0,
            mac: '',
            id: '',
            name: ip,
            loggedIn: false,
            identified: false,
            ready: false,
            intervalHandle: undefined,
            loginErrorPrinted: false,
            created: true,
            model: '',
            flags: {},
            enabled: true
        };

        return device;
    }

    /**
     * Creates full device from configuration table:
     * @param {Record<string, any>} tableDevice
     * @returns {Device}
     */
    createDeviceFromTable(tableDevice) {
        //internal configuration:
        const device = {
            client: {}, //filled later
            ip: tableDevice.ip,
            pin: tableDevice.pin,
            pollInterval: tableDevice.pollInterval,
            mac: tableDevice.mac.toUpperCase(),
            id: idFromMac(tableDevice.mac),
            name: tableDevice.name,
            loggedIn: false,
            identified: false,
            ready: false,
            intervalHandle: undefined,
            loginErrorPrinted: false,
            created: true,
            model: '',
            flags: {},
            enabled: tableDevice.enabled
        };

        return device;
    }

    /**
     * starting communication with device from config.
     * @param {Device} device
     * @returns {Promise<boolean>}
     */
    async startDevice(device) {
        //if device was already started -> stop it.
        //(use case: ip did change or settings did change)
        if (device.client && typeof device.client.close === 'function') {
            device.client.close();
        }
        if (device.intervalHandle) {
            clearTimeout(device.intervalHandle);
        }

        //interrogate enabled devices
        //this will get MAC for manually configured devices.
        if (device.enabled) {
            //create the soapclient
            device.client = createSoapClient({
                user: 'Admin',
                password: device.pin,
                url: 'http://' + device.ip + '/HNAP1'
            }); //no https, sadly.

            //login:
            await this.loginDevice(device);

            if (device.loggedIn) {
                try {
                    await this.identifyDevice(device);
                } catch (e) {
                    this.log.error(device.name + ' could not get settings: ' + e.stack);
                }
            }
        }

        //transfer enabled flag to object:
        await this.setStateAsync(device.id + enabledSuffix, {val: device.enabled, ack: true});

        //start polling if device is enabled (do this after all is setup).
        let result = false;
        if (device.enabled) {
            let interval = device.pollInterval;
            if (interval !== undefined && !Number.isNaN(interval) && interval > 0) {
                this.log.debug('Start polling for ' + device.name);
                result = true; //only use yellow/green states if polling at least one device.
                if (interval < 500) {
                    this.log.warn('Increasing poll rate to twice per second. Please check device config.');
                    interval = 500; //polling twice every second should be enough, right?
                }
                device.pollInterval = interval;
                // @ts-ignore
                device.intervalHandle = setTimeout(this.onInterval.bind(this, device),
                    device.pollInterval);
            } else {
                this.log.debug('Polling of ' + device.name + ' disabled, interval was ' + interval + ' (0 means disabled)');
            }
        }

        return result;
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Initialize your adapter here

        //get secret for decryption:
        const systemConfig = await this.getForeignObjectAsync('system.config');
        if (systemConfig) {
            this.secret = (systemConfig.native ? systemConfig.native.secret : '');
        }
        this.secret = this.secret || 'RJaeBLRPwvPfh5O'; //fallback in error case or for old installations without secret.

        //start auto detection:
        this.autoDetect();

        //start existing devices:
        let haveActiveDevices = false;
        const existingDevices = await this.getDevicesAsync();
        this.log.debug('Got existing devices: ' + JSON.stringify(existingDevices, null, 2));
        for (const existingDevice of existingDevices) {
            const device = this.createDeviceFromConfig(existingDevice);
            haveActiveDevices = await this.startDevice(device) || haveActiveDevices;
            //keep config and client for later reference.
            this.devices.push(device);
        }

        await this.setStateChangedAsync('info.connection', !haveActiveDevices, true); //if no active device -> make green.
    }

    /**
     * Poll a value, compare it to the value already set and if different, set value in DB.
     * @param pollFunc - function to use for polling
     * @param id - state Id
     * @returns {Promise<boolean>} //true if change did happen.
     */
    async pollAndSetState(pollFunc, id) {
        let value = await pollFunc();
        if (value === 'OK') {
            value = true; //for ready
        }
        if (value === 'ERROR') {
            //something went wrong... maybe can not read that setting at all?
            throw 'Error during reading ' + id;
        }

        const result = await this.setStateChangedAsync(id, value, true);
        // @ts-ignore
        return !result.notChanged;
    }

    /**
     * Do polling here.
     * @param device
     * @returns {Promise<void>}
     */
    async onInterval(device) {
        //this.log.debug('Polling ' + device.name);
        try {
            if (!device.loggedIn) {
                const result = await this.loginDevice(device);
                if (!result) {
                    return;
                }
            }
            if (!device.identified) {
                await this.identifyDevice(device);
            }
            await this.pollAndSetState(device.client.isDeviceReady, device.id + readySuffix);
            //poll ready will throw error if not ready.
            device.ready = true;
            await this.setStateChangedAsync('info.connection', true, true);
            if (device.flags.canSwitchOnOff) {
                await this.pollAndSetState(device.client.state, device.id + stateSuffix);
            }
            if (device.flags.hasLastDetected) {
                const detectionHappened = await this.pollAndSetState(device.client.lastDetection, device.id + lastDetectedSuffix);
                if (detectionHappened) {
                    //always set state to true, for new detections.
                    await this.setStateAsync(device.id + stateSuffix, detectionHappened, true);
                } else {
                    await this.setStateChangedAsync(device.id + stateSuffix, false, true);
                }

                //fill no detection variable:
                const lastDetection = await this.getStateAsync(device.id + lastDetectedSuffix);
                if (lastDetection) {
                    //@ts-ignore -> we already check for null / undefined???
                    const noMotion = Math.round((Date.now() - /** @type {number} */ lastDetection.val) / 1000);
                    await this.setStateChangedAsync(device.id + noMotionSuffix, noMotion, true);
                }
            }
            if (device.flags.hasTemp) {
                await this.pollAndSetState(device.client.temperature, device.id + temperatureSuffix);
            }
            if (device.flags.hasPower) {
                await this.pollAndSetState(device.client.consumption, device.id + powerSuffix);
            }
            if (device.flags.hasTotalPower) {
                await this.pollAndSetState(device.client.totalConsumption, device.id + totalPowerSuffix);
            }
            //this.log.debug('Polling of ' + device.name + ' finished.');
        } catch (e) {
            if (device.ready) {
                this.log.debug('Error during polling ' + device.name + ': ' + JSON.stringify(e, null, 2));
            }
            if (e.errno === 403) {
                device.loggedIn = false; //login next polling.
            }
            device.ready = false;
            await this.setStateChangedAsync(device.id + readySuffix, false, true);

            let connected = false;
            this.devices.forEach((device) => { connected = connected || device.ready; }); //turn green if at least one device is ready = reachable.
            await this.setStateChangedAsync('info.connection', connected, true);
        }
        device.intervalHandle = setTimeout(this.onInterval.bind(this, device),
            device.pollInterval);
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            this.log.debug('Stop polling');
            for (const device of this.devices) {
                if (device.intervalHandle) {
                    clearInterval(device.intervalHandle);
                }
                if (device.client && typeof device.client.close === 'function') {
                    device.client.close();
                }
            }
            if (this.mdns && typeof this.mdns.close === 'function') {
                this.mdns.close();
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
            this.log.info('object ' + id + ' changed: ' + JSON.stringify(obj, null, 2));
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
                const devId = device.id + stateSuffix;
                if (id === devId) {
                    //found device:
                    this.log.debug('Found device to switch.');
                    let switchFunc = device.client.off;
                    if (state.val) {
                        switchFunc = device.client.on;
                    }

                    try {
                        await switchFunc();
                        this.log.debug('Switched ' + device.name + (state.val ? ' on.' : ' off.'));
                        await this.pollAndSetState(device.client.state, device.id + stateSuffix);
                    } catch(e) {
                        this.log.error('Error while switching device ' + device.name + ': ' +  + JSON.stringify(e, null, 2));
                    }
                    break; //can stop loop.
                }
            }
        }
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
                            if (!device.alreadyPresent) {
                                device.readOnly = true;
                                devices.push(device);
                            }
                        }
                        this.sendTo(obj.from, obj.command, devices, obj.callback);
                    }
                    break;
                }
                case 'getDevices': {
                    const devices = await this.getDevicesAsync();
                    const tableDevices = [];
                    for (const device of devices)  {
                        device.native.pin = decrypt(this.secret, device.native.pin);
                        tableDevices.push(device.native);
                    }
                    if (obj.callback) {
                        this.sendTo(obj.from, obj.command, tableDevices, obj.callback);
                    }
                    break;
                }
                case 'sendDevices': {
                    try {
                        const inCommingDevices = /** @type {Record<string, any>} */ (obj.message).devices || [];
                        this.log.debug('Got devices: ' + JSON.stringify(inCommingDevices, null, 2));
                        for (const device of this.devices) {
                            let found = false;
                            let changed = false;
                            for (const configDevice of inCommingDevices) {
                                if (configDevice.mac.toUpperCase() === device.mac.toUpperCase()) {
                                    found = true;
                                    changed = configDevice.ip !== device.ip || configDevice.pin !== device.pin ||
                                        configDevice.name !== device.name || configDevice.pollInterval !== device.pollInterval ||
                                        configDevice.enabled !== device.enabled;
                                    if (changed) {
                                        device.ip = configDevice.ip;
                                        device.pin = configDevice.pin;
                                        device.name = configDevice.name;
                                        device.pollInterval = configDevice.pollInterval;
                                        device.enabled = configDevice.enabled;
                                    }
                                    configDevice.found = true;
                                    break;
                                }
                            }

                            //remove not found devices:
                            if (!found || changed) {
                                if (device.client && typeof device.client.close === 'function') {
                                    device.client.close();
                                }
                                if (device.intervalHandle) {
                                    clearTimeout(device.intervalHandle);
                                }

                                //delete not found devices -> user deleted them from table
                                if (!found) {
                                    this.log.debug(device.name + ' not in config anymore. Delete objects for ' + device.mac);
                                    try {
                                        const ids = await this.getObjectListAsync({
                                            startkey: device.id,
                                            endkey: device.id + '\u9999'
                                        });
                                        if (ids) {
                                            for (const obj of ids.rows) {
                                                await this.delObjectAsync(obj.value._id);
                                            }
                                        }
                                    } catch (e) {
                                        this.log.error('Error during deletion of ' + device.mac + ': ' + e.stack);
                                    }
                                } else {
                                    //device did change -> restart:
                                    await this.createNewDevice(device); //store device settings
                                    await this.startDevice(device); //will also store new parameters.
                                }
                            }
                        }

                        for (const device of inCommingDevices) {
                            if (!device.found) {
                                if (!device.mac || !device.pin || !device.ip) {
                                    this.log.error('Incomplete device: ' + JSON.stringify(device, null, 2));
                                    continue;
                                }
                                this.log.debug('New device ' + JSON.stringify(device, null, 2));
                                const fullDevice = this.createDeviceFromTable(device);
                                await this.createNewDevice(fullDevice);
                                await this.startDevice(fullDevice);
                            }
                        }
                    } catch (e) {
                        this.log.error('Error during processing config: ' + e.stack);
                    } finally {
                        if (obj.callback) {
                            this.sendTo(obj.from, obj.command, 'success', obj.callback);
                        }
                    }
                    break; //end switch clause.
                }
                case 'identifyDevice': {
                    const params = /** @type {Record<string, any>} */ (obj.message);
                    if (params && params.ip && params.pin) {
                        const device = this.createDeviceFromIpAndPin(params.ip, params.pin);
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

    autoDetect() {
        this.mdns = new Mdns({
            timeout: 0, //0 == stay active??
            name: [ '_dhnap._tcp.local' ],
            find: '*',
            broadcast: true
        });

        this.log.debug('Auto detection started');
        this.mdns.on('entry', this.onDetection.bind(this));
        this.mdns.run(() => this.log.info('Discovery done'));
    }

    async onDetection(entry) {
        //format of data: length-byte + text + length-byte + text + length-byte + text ...
        function extractStringsFromBuffer(buffer) {
            let index = 0;
            const strings = [];
            while(index < buffer.length) {
                const length = buffer.readInt8(index);
                index += 1;
                strings.push(buffer.subarray(index, index + length).toString());
                index += length;
            }
            return strings;
        }

        //somehow starts to detect fritzbox later on??
        if (entry.name !== '_dhnap._tcp.local') {
            //this.log.debug('Ignoring false detection? -> ' + entry.ip + ' - ' + entry.name);
            return;
        }

        this.log.debug('Got discovery: ' + JSON.stringify(entry, null, 2));
        if (entry.TXT && entry.TXT.data) {
            //build detected device and fill it:
            let device = this.detectedDevices[entry.ip];
            if (!device) {
                device = {
                    ip: entry.ip,
                    name: entry.name
                };
            }

            //parse buffer:
            const keyValuePairs = extractStringsFromBuffer(entry.TXT.data);
            for (const pair of keyValuePairs) {
                const [ key, value ] = pair.split('=');
                switch(key.toLowerCase()) {
                    //extract mac from buffer:
                    case 'mac': {
                        device.mac = value.toUpperCase();
                        break;
                    }
                    //extract model number from buffer:
                    case 'model_number': {
                        device.type = value;
                        break;
                    }
                    //if mydlink=true -> we should look at that device! :)
                    case 'mydlink': {
                        if (value === 'true') {
                            device.mydlink = true; //ok, great :-)
                        }
                    }
                }
            }

            if (device.mydlink) {
                this.detectedDevices[device.ip] = device;
                const oldDevice = this.devices.find(d => d.mac === device.mac);
                if (oldDevice) {
                    //found device we already know. Let's check ip.
                    if (device.ip !== oldDevice.ip) {
                        oldDevice.ip = device.ip;
                        await this.startDevice(oldDevice);
                    }
                    device.alreadyPresent = true;
                }
                this.log.debug('Detected Device now is: ' + JSON.stringify(device, null, 2));
            }
        }
    }
}

// @ts-ignore parent is a valid property on module
if (module.parent) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new DlinkSmarthome(options);
} else {
    // otherwise start the instance directly
    new DlinkSmarthome();
}
