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
const Mdns = require('mdns-discovery');
const deviceFlags = require('./lib/deviceFlags');

// Load your modules here, e.g.:
// const fs = require('fs');
const createSoapClient = require('./lib/soapclient.js');
const WebSocketClient = require('dlink_websocketclient');
const axios = require('axios').default;

const unreachableSuffix = '.unreachable';
const enabledSuffix = '.enabled';
const stateSuffix = '.state';
const powerSuffix = '.currentPower';
const totalPowerSuffix = '.totalPower';
const temperatureSuffix = '.temperature';
const lastDetectedSuffix = '.lastDetected';
const noMotionSuffix = '.no_motion';

function decrypt(key, value) {
    if (!value || !key) {
        return value;
    }
    let result = '';
    for (let i = 0; i < value.length; ++i) {
        result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
    }
    return result;
}
function encrypt(key, value) {
    if (!value || !key) {
        return value;
    }
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
 * @property {Record<string, boolean | number>} flags determine what features the hardware has
 * @property {boolean} enabled true if device should be talked too.
 * @property {boolean} useWebSocket true if device uses webSocket client instead of soapclient.
 */

class MyDlink extends utils.Adapter {
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
        if (!device.id && device.mac) {
            device.id = idFromMac(device.mac);
        }
        if (!device.id) {
            this.log.warn('Could not create device ' + device.name + ' without MAC. Please check config or if device is online.');
            return;
        }

        //also set the native part of the device:
        await this.extendObjectAsync(device.id, {
            type: 'device',
            common: {
                name: device.name
            },
            native: {
                ip: device.ip,
                mac: device.mac,
                pin: encrypt(this.secret, device.pin),
                pollInterval: device.pollInterval,
                enabled: device.enabled,
                name: device.name,
                model: device.model,
                useWebSocket: device.useWebSocket
            }
        });
    }

    /**
     * Creates objects based on flags on device. IE for W215 also temperature and power measurement.
     * @param {Device} device
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
                    role: 'value.power',
                    unit: 'W',
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

        if (device.flags.numSockets !== undefined && device.flags.numSockets > 1) {
            await this.delObjectAsync(device.id + stateSuffix);
            for (let index = 1; index <= device.flags.numSockets; index += 1) {
                const id = device.id + stateSuffix + '_' + index;
                await this.setObjectNotExistsAsync(id, {
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
                await this.subscribeStatesAsync(id);
            }
        } else {
            if (device.flags.canSwitchOnOff) {
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
                await this.subscribeStatesAsync(device.id + stateSuffix);

            } else {
                await this.setObjectNotExistsAsync(device.id + stateSuffix, {
                    type: 'state',
                    common: {
                        name: 'state',
                        type: 'boolean',
                        role: 'sensor.motion',
                        read: true,
                        write: false
                    },
                    native: {}
                });
            }
        }

        //enabled indicator:
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

        //have ready indicator:
        await this.setObjectNotExistsAsync(device.id + unreachableSuffix, {
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
        await this.delObjectAsync(device.id + '.ready'); //remove old .ready state -> now .unreachable as per ioBroker logic.
    }

    /**
     * Reads settings from device and sets flags for object creation and polling.
     * @param {Device} device
     * @returns {Promise<*>}
     */
    async identifyDevice(device) {
        //get device settings, which returns model name and firmware version. So we know what states to create.
        let mac;
        let canSwitch;
        if (device.useWebSocket) {
            //is mac stripped of :
            const id = device.client.getDeviceId();
            mac = id.match(/.{2}/g).join(':').toUpperCase(); //add back the :.
            canSwitch = true;

            //get model from webserver / wifi-ssid:
            const url = `http://${device.ip}/login?username=Admin&password=${device.pin}`;
            const result = await axios.get(url);
            if (result.status === 200) {
                const startPos = result.data.indexOf('SSID: ') + 6;
                const model = result.data.substring(startPos, startPos + 8);
                if (!model) {
                    this.log.warn(`${device.name} identify responded with unknown result, please report: ${result.data}`);
                }
                this.log.debug('Got model ' + model + ' during identification of ' + device.name);
                if (model !== device.model) {
                    this.log.debug('Model updated from ' + (device.model || 'unknown') + ' to ' + model);
                    device.model = model;
                    //store new model in device object:
                    await this.createNewDevice(device);
                }
            }
        } else {
            const settings = await device.client.getDeviceSettings();
            this.log.debug(device.name + ' returned following device settings: ' + JSON.stringify(settings, null, 2));
            device.model = settings.ModelName;
            mac = settings.DeviceMacId.toUpperCase();
            canSwitch = device.model.toUpperCase().includes('DSP') || (settings.ModuleTypes.find(t => t.indexOf('Plug') >= 0)); //if is socket, probably can switch on/off
        }

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

        //for device identification by IP set name to model here:
        if (!device.name) {
            device.name = device.model;
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
                let xmls;
                if (device.useWebSocket) {
                    xmls = 'UNKNOWN WEBSOCKET DEVICE: ' + device.model;
                } else {
                    //report unknown device:
                    xmls = await device.client.getDeviceDescriptionXML();
                }
                this.log.info('Found new device, please report the following (full log from file, please) to developer: ' + JSON.stringify(xmls, null, 2));
                if (this.supportsFeature && this.supportsFeature('PLUGINS')) {
                    const sentryInstance = this.getPluginInstance('sentry');
                    if (sentryInstance) {
                        const Sentry = sentryInstance.getSentryObject();
                        if (Sentry) {
                            Sentry.withScope(scope => {
                                scope.setLevel('info');
                                for (const key of Object.keys(xmls)) {
                                    scope.setExtra(key, xmls[key]);
                                }
                                Sentry.captureMessage('Unknown-Device ' + device.model, 'info'); // Level 'info'
                            });
                        }
                    }
                }
            }
        }

        if (device.useWebSocket) {
            //get first status here, after model is known:
            if (device.flags.numSockets !== undefined && device.flags.numSockets > 1) {
                const states = await device.client.state(-1); //get all states.
                for (let index = 1; index <= device.flags.numSockets; index += 1) {
                    await this.setStateChangedAsync(device.id + stateSuffix + '_' + index, states[index -1], true);
                }
            } else {
                const state = await device.client.state();
                await this.setStateChangedAsync(device.id + stateSuffix, state, true);
            }
        }

        await this.createObjects(device);
        device.identified = true;
        return device;
    }

    /**
     * deletes all objects of an device and the device itself (deleteDeviceAsync does not work somehow...?)
     * @param {Device} device
     */
    async deleteDeviceFull(device) {
        //stop device:
        this.stopDevice(device);

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
        } catch (e) {
            this.log.error('Error during deletion of ' + device.id + ': ' + e.stack);
        }
    }

    /**
     * Starts log in for device. Needs to be done before additional commands can work.
     * @param {Device} device
     * @returns {Promise<boolean>}
     */
    async loginDevice(device) {
        try {
            if (device.useWebSocket) {
                device.client = new WebSocketClient({
                    ip: device.ip,
                    pin: device.pin,
                    keepAlive: 5,
                    useTelnetForToken: device.pin.toUpperCase() === 'TELNET',
                    log: console.debug
                });
            } else {
                //create the soapclient
                device.client = createSoapClient({
                    user: 'Admin',
                    password: device.pin,
                    url: 'http://' + device.ip + '/HNAP1'
                }); //no https, sadly.
            }

            const loginResult = await device.client.login();
            if (loginResult === true) {
                this.log.debug(device.name + ' successfully logged in. ' + loginResult);
                device.loggedIn = true;
                device.loginErrorPrinted = false;
            } else {
                if (!device.loginErrorPrinted) {
                    this.log.debug('Login error: soapclient returned ' + loginResult + ' - this should not really happen.');
                    this.log.error(device.name + ' could not login. Please check credentials and if device is online/connected.');
                    device.loginErrorPrinted = true;
                }
            }
        } catch (e) {
            const code = this.processNetworkError(e);
            if (!device.useWebSocket && (code === 500 || code === 'ECONNREFUSED')) { //let's try websocket.
                device.client.disconnect();
                device.useWebSocket = true;
                return this.loginDevice(device);
            }

            this.log.debug('Login error: ' + e.stack);
            if (!device.loginErrorPrinted && e.code !== 'ETIMEDOUT' && e.code !== 'ECONNABORTED' && e.code !== 'ECONNRESET') {
                this.log.error(device.name + ' could not login. Please check credentials and if device is online/connected. Error: ' + e.code + ' - ' + e.stack);
                device.loginErrorPrinted = true;
            }

            device.loggedIn = false;
            if (device.useWebSocket || !device.pollInterval) { //if no polling takes place, need to retry login!
                if (device.intervalHandle) {
                    clearTimeout(device.intervalHandle);
                }
                device.intervalHandle = setTimeout(() => this.startDevice(device), 10000); //retry here if no polling.
            }
        }
        return device.loggedIn;
    }

    /**
     * Create device object from ioBroker-Object.
     * @param {ioBroker.DeviceObject} configDevice
     * @returns {Device}
     */
    createDeviceFromConfig(configDevice) {
        this.log.debug('Processing ' + configDevice.common.name);
        const native = configDevice.native;

        //internal configuration:
        return {
            client: {}, //filled later
            ip: /** @type {string} */ (native.ip),
            pin: (native.mac && !native.pinNotEncrypted) ? decrypt(this.secret, native.pin) : /** @type {string} **/ (native.pin),
            pollInterval: /** @type {number} */ (native.pollInterval),
            mac: native.mac ? /** @type {string} */ (native.mac).toUpperCase() : '',
            id: configDevice._id.split('.')[2], //for easier state updates -> depents on MAC. - remove adapter & instance
            name: /** @type {string} */ (native.name), //for easier logging
            loggedIn: false,
            identified: false,
            ready: false,
            intervalHandle: undefined,
            loginErrorPrinted: false,
            created: true,
            model: /** @type {string} */ (native.model || ''),
            flags: {},
            enabled: /** @type {boolean} */ (native.enabled),
            useWebSocket: /** @type {boolean} */ (native.useWebSocket)
        };
    }

    /**
     *
     * @param {string} ip
     * @param {string} pin
     * @returns {Device}
     */
    createDeviceFromIpAndPin(ip, pin) {
        //internal configuration:
        return {
            client: {}, //filled later
            ip: ip,
            pin: pin,
            pollInterval: 30000,
            mac: '',
            id: '',
            name: '',
            loggedIn: false,
            identified: false,
            ready: false,
            intervalHandle: undefined,
            loginErrorPrinted: false,
            created: true,
            model: '',
            flags: {},
            enabled: true,
            useWebSocket: false
        };
    }

    /**
     * Creates full device from configuration table:
     * @param {Record<string, any>} tableDevice
     * @param {boolean} [doDecrypt] if false will not decrypt pin here. Defaults to false.
     * @returns {Device}
     */
    createDeviceFromTable(tableDevice, doDecrypt = false) {
        //internal configuration:
        return {
            client: {}, //filled later
            ip: tableDevice.ip,
            pin: doDecrypt && tableDevice.mac ? decrypt(this.secret, tableDevice.pin) : tableDevice.pin,
            pollInterval: tableDevice.pollInterval,
            mac: tableDevice.mac ? tableDevice.mac.toUpperCase() : '',
            id: tableDevice.mac ? idFromMac(tableDevice.mac) : '',
            name: tableDevice.name,
            loggedIn: false,
            identified: false,
            ready: false,
            intervalHandle: undefined,
            loginErrorPrinted: false,
            created: true,
            model: '',
            flags: {},
            enabled: tableDevice.enabled,
            useWebSocket: false
        };
    }

    /**
     * errorHandler for socket errors with webSocketClient
     * @param {Device} device
     * @param {number|undefined} [code] possible error code
     * @param {Object|undefined} [err] possible error object
     */
    async errorHandler(device, code, err) {
        await this.setStateAsync(device.id + unreachableSuffix, true, true);
        if (code || err) {
            this.log.debug(device.name + ': Socket error: ' + code + ' - ' + err ? err.stack : err);
        } else {
            this.log.debug(device.name + ': Socket closed.');
        }
        this.stopDevice(device);
        device.ready = false;
        //abuse unused intervalHandle here.
        if (device.intervalHandle) {
            clearTimeout(device.intervalHandle);
        }
        device.intervalHandle = setTimeout(() => {
            this.startDevice(device);
        }, 10000);
    }

    /**
     * starting communication with device from config.
     * @param {Device} device
     * @returns {Promise<boolean>}
     */
    async startDevice(device){
        //if device was already started -> stop it.
        //(use case: ip did change or settings did change)
        this.stopDevice(device);

        //interrogate enabled devices
        //this will get MAC for manually configured devices.
        if (device.enabled) {
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
            if (device.useWebSocket) {
                //event listener:
                device.client.on('switched', (val, socket) => {
                    this.log.debug(`Event from device ${socket} now ${val}`);
                    if (device.flags.numSockets !== undefined && device.flags.numSockets > 1) {
                        this.setStateAsync(device.id + stateSuffix + '_' + (socket + 1), val, true);
                    } else {
                        this.setStateAsync(device.id + stateSuffix, val, true);
                    }
                });
                //error handling:
                device.client.on('error', (code, error) => this.errorHandler(device, code, error));
                device.client.on('close', () => this.errorHandler(device));
                device.client.on('message', (message) => this.log.debug(`${device.name} got message: ${message}`));
                await this.setStateAsync(device.id + unreachableSuffix, false, true);
                device.ready = true;
                this.log.debug('Setup device event listener.');
            }

            //some devices, for example W245, don't push.. so poll websocket also.
            let interval = device.pollInterval;
            if (interval !== undefined && !Number.isNaN(interval) && interval > 0) {
                this.log.debug('Start polling for ' + device.name + ' with interval ' + interval);
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
        const configDevicesToAdd = [].concat(this.config.devices);
        this.log.debug('Got existing devices: ' + JSON.stringify(existingDevices, null, 2));
        this.log.debug('Got config devices: ' + JSON.stringify(configDevicesToAdd, null, 2));
        let needUpdateConfig = false;
        for (const existingDevice of existingDevices) {
            let found = false;
            for (const configDevice of this.config.devices) {
                // @ts-ignore
                needUpdateConfig = !configDevice.mac;
                // @ts-ignore
                if ((configDevice.mac && configDevice.mac === existingDevice.native.mac) ||
                    // @ts-ignore
                    (!configDevice.mac && configDevice.ip === existingDevice.native.ip)) {
                    found = true;

                    //copy all data from config, because now only config is changed from config dialog.
                    for (const key of Object.keys(configDevice)) {
                        existingDevice.native[key] = configDevice[key]; //copy all fields.
                    }
                    // @ts-ignore
                    existingDevice.native.pinNotEncrypted = !configDevice.mac;

                    configDevicesToAdd.splice(configDevicesToAdd.indexOf(configDevice), 1);
                    break; //break on first copy -> will remove additional copies later.
                }
            }
            const device = this.createDeviceFromConfig(existingDevice);
            await this.createNewDevice(device); //store new config.
            if (existingDevice.native.pinNotEncrypted) {
                needUpdateConfig = true;
            }
            if (found) {
                haveActiveDevices = await this.startDevice(device) || haveActiveDevices;
                //keep config and client for later reference.
                this.devices.push(device);
            } else {
                this.log.debug('Deleting ' + device.name);
                await this.deleteDeviceFull(device);
            }
        }

        //add non-existing devices from config:
        for (const configDevice of configDevicesToAdd) {
            const device = this.createDeviceFromTable(configDevice, !configDevice.pinNotEncrypted);
            this.log.debug('Device ' + device.name + ' in config but not in devices -> create and add.');
            const oldDevice = this.devices.find(d => d.mac === device.mac);
            if (oldDevice) {
                this.log.info('Duplicate entry for ' + device.mac + ' in config. Trying to rectify. Restart will happen. Affected devices: ' + device.name + ' === ' + configDevice.name);
                needUpdateConfig = true;
            } else {
                //make sure objects are created:
                await this.createNewDevice(device);

                haveActiveDevices = await this.startDevice(device) || haveActiveDevices;
                //call this here again, to make sure it happens.
                await this.createNewDevice(device); //store device settings
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
                    pin: encrypt(this.secret, device.pin),
                    pollInterval: device.pollInterval,
                    enabled: device.enabled,
                    name: device.name,
                    model: device.model,
                    useWebSocket: device.useWebSocket
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
     * Poll a value, compare it to the value already set and if different, set value in DB.
     * @param pollFunc - function to use for polling / or set state
     * @param id - full or local id.
     * @param {Record<string, boolean>} [flags] convert to number or invert boolean
     * @returns {Promise<boolean>} //true if change did happen.
     */
    async pollAndSetState(pollFunc, id, flags = {number: false, invert: false}) {
        let value = await pollFunc();
        if (value === 'ERROR') {
            //something went wrong... maybe can not read that setting at all?
            throw new Error('Error during reading ' + id);
        } else if (value === 'false') {
            value = false;
        } else if (value === 'true') {
            value = true;
        } else if (typeof value === 'string' && flags.number) {
            value = Number(value); //prevent wrong type warnings.
        }

        if (flags.invert) {
            value = !value;
        }

        const result = await this.setStateChangedAsync(id, value, true);
        // @ts-ignore
        return !result.notChanged;
    }

    /**
     * Get code from network error.
     * @param {Record<string, any>} e
     * @returns {number|string}
     */
    processNetworkError(e) {
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

    /**
     * Do polling here.
     * @param device
     * @returns {Promise<void>}
     */
    async onInterval(device) {
        //this.log.debug('Polling ' + device.name);
        try {
            if (!device.loggedIn) {
                await this.loginDevice(device);
            }
            if (device.loggedIn && !device.identified) {
                await this.identifyDevice(device);
            }
            if (device.loggedIn && device.identified) {
                await this.pollAndSetState(device.client.isDeviceReady.bind(device.client), device.id + unreachableSuffix, {invert: true});
                //poll ready will throw error if not ready.
                device.ready = true;
                await this.setStateChangedAsync('info.connection', true, true);
                if (device.flags.canSwitchOnOff) {
                    if (device.flags.numSockets !== undefined && device.flags.numSockets > 1) {
                        const states = await device.client.state(-1); //get all socket states.
                        for (let index = 1; index <= device.flags.numSockets; index += 1) {
                            const id = device.id + stateSuffix + '_' + index;
                            const val = states[index - 1];
                            await this.setStateChangedAsync(id, val, true);
                        }
                    } else {
                        await this.pollAndSetState(device.client.state.bind(device.client), device.id + stateSuffix);
                    }
                }
                if (device.flags.hasLastDetected) {
                    const detectionHappened = await this.pollAndSetState(device.client.lastDetection.bind(device.client), device.id + lastDetectedSuffix);
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
                    await this.pollAndSetState(device.client.temperature.bind(device.client), device.id + temperatureSuffix, {number: true});
                }
                if (device.flags.hasPower) {
                    await this.pollAndSetState(device.client.consumption.bind(device.client), device.id + powerSuffix, {number: true});
                }
                if (device.flags.hasTotalPower) {
                    await this.pollAndSetState(device.client.totalConsumption.bind(device.client), device.id + totalPowerSuffix, {number: true});
                }
                //this.log.debug('Polling of ' + device.name + ' finished.');
            }
        } catch (e) {
            const code = this.processNetworkError(e);
            if (code === 403 || device.ready) {
                device.loggedIn = false; //login next polling.
            }
            this.log.debug('Error during polling ' + device.name + ': ' + code + ' - ' + e.stack + ' - ' + e.body);
            device.ready = false;
            await this.setStateChangedAsync(device.id + unreachableSuffix, true, true);

            let connected = false;
            this.devices.forEach((device) => { connected = connected || device.ready; }); //turn green if at least one device is ready = reachable.
            await this.setStateChangedAsync('info.connection', connected, true);
        }
        device.intervalHandle = setTimeout(this.onInterval.bind(this, device),
            device.pollInterval);
    }

    stopDevice(device) {
        if (device.client && typeof device.client.removeAllListeners === 'function') {
            device.client.removeAllListeners('switch');
            device.client.removeAllListeners('error');
            device.client.removeAllListeners('close');
        }
        if (device.intervalHandle) {
            clearInterval(device.intervalHandle);
        }
        if (device.client && typeof device.client.disconnect === 'function') {
            device.client.disconnect();
        }
        device.ready = false;
        device.loggedIn = false;
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    onUnload(callback) {
        try {
            this.log.debug('Stop polling');
            for (const device of this.devices) {
                this.stopDevice(device);
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
                const devId = this.namespace + '.' + device.id + stateSuffix;
                if (id.startsWith(devId)) {
                    //found device:
                    this.log.debug('Found device to switch.');

                    try {
                        if (!device.loggedIn) {
                            await this.loginDevice(device);
                        }
                        let socket = 0;
                        if (id !== devId) {
                            socket = Number(devId.substring(devId.lastIndexOf('_') + 1)) - 1; //convert to 0 based index here.
                        }
                        await device.client.switch(state.val, socket);
                        this.log.debug(`Switched Socket ${socket} of ${device.name} ${state.val ? 'on' : 'off'}.`);
                        await this.pollAndSetState(device.client.state.bind(device.client, socket), id); //can be full id here.
                    } catch(e) {
                        const code = this.processNetworkError(e);
                        if (code === 403) {
                            device.loggedIn = false; //login next polling.
                        }
                        this.log.error('Error while switching device ' + device.name + ': ' + code + ' - ' + e.stack);
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
                            device.readOnly = true;
                            devices.push(device);
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
            name: [ '_dhnap._tcp.local', '_dcp._tcp.local' ],
            find: '*',
            broadcast: false
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
        if (entry.name !== '_dhnap._tcp.local' && entry.name !== '_dcp._tcp.local') {
            //this.log.debug('Ignoring false detection? -> ' + entry.ip + ' - ' + entry.name);
            return;
        }
        if (entry.name === '_dcp._tcp.local') {
            this.log.debug('Maybe detected websocket device');
            console.log(entry);
            //get model:
            let model;
            if (entry.PTR && entry.PTR.data) {
                model = entry.PTR.data.substring(0, 8);
            }

            //somehow I get records for devices from wrong IP.. or they report devices, they detect under their IP?? not sure...
            //let's connect here and get the MAC -> so we can securely identify the device.
            //then decide if it is a new one (update & present in UI) or an old one (ignore for now).
            const newDevice = this.createDeviceFromIpAndPin(entry.ip, 'INVALID');
            newDevice.model = model;
            newDevice.client = new WebSocketClient({
                ip: newDevice.ip,
                pin: newDevice.pin,
                useTelnetForToken: false,
                log: console.debug
            });

            try {
                await newDevice.client.login();
                newDevice.id = newDevice.client.getDeviceId().toUpperCase();
                if (newDevice.id) {
                    // @ts-ignore
                    newDevice.mac = newDevice.id.match(/.{2}/g).join(':');
                    this.log.debug(`Got websocket device ${model} on ${newDevice.ip}`);
                }
            } catch (e) {
                this.log.debug('Could not identify websocket device: ' + e.stack);
            } finally {
                this.stopDevice(newDevice);
            }

            //now use mac to check if we already now that device:
            const device = this.devices.find(device => device.mac === entry.mac);
            if (device) {
                this.log.debug(`Device was already present as ${device.model} on ${device.ip}`);
                if (device.ip === newDevice.ip && device.model !== newDevice.model) {
                    this.log.debug(`Model still differs? ${device.model} != ${newDevice.model}`);
                    if (model && device.useWebSocket) {
                        this.log.debug('Updated model to ' + model);
                        device.model = model;
                        await this.createNewDevice(device); //store model in config.
                    }
                }
            } else { //not known yet, add to detected devices:
                this.detectedDevices[entry.ip] = {
                    ip: newDevice.ip,
                    name: entry.name,
                    type: model,
                    mac: newDevice.mac,
                    mydlink: true,
                    useWebSocket: true,
                    alreadyPresent: !!device
                };
            }
        }

        //this.log.debug('Got discovery: ' + JSON.stringify(entry, null, 2));
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
                    //update model, if differs.
                    if (oldDevice.model !== device.type) {
                        oldDevice.model = device.type;
                    }
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
