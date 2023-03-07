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

                // @ts-ignore
            } else if (device.flags.type.includes('detection')) {
                const role = device.flags.type === 'Motion detection' ? 'sensor.motion' : 'sensor.alarm.flood';
                await this.setObjectNotExistsAsync(device.id + stateSuffix, {
                    type: 'state',
                    common: {
                        name: 'state',
                        type: 'boolean',
                        role: role,
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

        //reboot button:
        if (!device.useWebSocket) {
            await this.setObjectNotExistsAsync(device.id + rebootSuffix, {
                type: 'state',
                common: {
                    name: 'reboot device',
                    type: 'boolean',
                    role: 'button',
                    read: false,
                    write: true
                },
                native: {}
            });
            await this.subscribeStatesAsync(device.id + rebootSuffix);
        } else {
            await this.delObjectAsync(device.id + rebootSuffix);
        }

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
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {

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
            const device = DeviceInfo.createFromObject(existingDevice);
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
            const device = DeviceInfo.createFromTable(configDevice, !configDevice.pinNotEncrypted);
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
                    pin: DeviceInfo.encryptDecrypt(this.secret, device.pin),
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
                const devId = this.namespace + '.' + device.id;
                if (id.startsWith(devId)) {
                    //found device:
                    this.log.debug('Found device to switch.');

                    try {
                        if (!device.loggedIn) {
                            await this.loginDevice(device);
                        }
                        let socket = 0;
                        if (id === devId + rebootSuffix) {
                            await device.client.reboot();
                            this.log.debug(`Send reboot request to ${device.name}`);
                        } else if (id.startsWith(devId + stateSuffix)) {
                            if (id !== devId + stateSuffix) {
                                socket = Number(id.substring(id.lastIndexOf('_') + 1)) - 1; //convert to 0 based index here.
                            }
                            await device.client.switch(state.val, socket);
                            this.log.debug(`Switched Socket ${socket} of ${device.name} ${state.val ? 'on' : 'off'}.`);
                            await this.pollAndSetState(device.client.state.bind(device.client, socket), id); //can be full id here.
                        } else {
                            this.log.error(`Don't know what to do for change in ${id}`);
                        }
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
                        device.native.pin = DeviceInfo.encryptDecrypt(this.secret, device.native.pin);
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
                        const device = new DeviceInfo(params.ip, params.pin);
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
