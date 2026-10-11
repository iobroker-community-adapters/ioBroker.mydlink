import { Device, processNetworkError, WrongMacError, WrongModelError } from './Device';
import { Suffixes } from './suffixes';
import { normalizeMac } from './TableDevice';
import type { SoapClientInterface } from './Clients';
import createSoapClient from './soapclient';
import type { Mydlink } from './mydlink';

/**
 * Representation of a Soap Device.
 */
export class SoapDevice extends Device {
    client: SoapClientInterface;
    /**
     * SOAP actions the device supports, e.g. 'SetTimeSettings'.
     */
    soapActions: string[] = [];

    /**
     * Creates a new Soap Device.
     *
     * @param adapter reference to adapter
     * @param ip ip of device
     * @param pin pin of device
     */
    constructor(adapter: Mydlink, ip: string, pin: string) {
        super(adapter, ip, pin);

        //does only set up soapClient -> no connection, yet.
        this.client = createSoapClient({
            user: 'Admin',
            password: this.pin,
            url: `http://${this.ip}/HNAP1`,
        });
    }

    /**
     * Creates objects for the device.
     */
    async createObjects(): Promise<void> {
        await super.createObjects();
        //create state object, for plug this is writable for sensor not.
        await this.adapter.setObjectNotExistsAsync(this.id + Suffixes.reboot, {
            type: 'state',
            common: {
                name: 'reboot device',
                type: 'boolean',
                role: 'button',
                read: false,
                write: true,
            },
            native: {},
        });
        await this.adapter.subscribeStatesAsync(this.id + Suffixes.reboot);
    }

    /**
     * Run an action on the device. The device closes the session after a few minutes without requests
     * (i.e. if polling is slower than that or disabled), so log in again once and retry if it was rejected with 403.
     *
     * @param action the action to execute
     * @returns result of the action
     */
    protected async withRelogin<T>(action: () => Promise<T>): Promise<T> {
        try {
            return await action();
        } catch (e: any) {
            if (processNetworkError(e) !== 403) {
                throw e;
            }
            this.adapter.log.debug(`${this.name} session expired, logging in again.`);
            this.loggedIn = false;
            await this.login();
            return action();
        }
    }

    /**
     * process a state change. Device will just try to switch plug. Children will have to overwrite this behaviour.
     *
     * @param id if of state
     * @param state new state
     */
    async handleStateChange(id: string, state: ioBroker.State): Promise<void> {
        if (!this.loggedIn) {
            await this.login();
        }

        //button: only react on true, ignore resets to false.
        if (id.endsWith(Suffixes.reboot) && state.val) {
            try {
                await this.withRelogin(() => this.client.reboot());
                this.adapter.log.debug(`Send reboot request to ${this.name}`);
            } catch (e: any) {
                await this.handleNetworkError(e);
            }
        }
    }

    /**
     * Identify the device, i.e. check mac and model.
     *
     * @returns true if identification successful
     */
    async identify(): Promise<boolean> {
        const settings = await this.client.getDeviceSettings();
        let dirty = false;
        this.adapter.log.debug(`${this.name} returned following device settings: ${JSON.stringify(settings, null, 2)}`);
        const mac = normalizeMac(settings.DeviceMacId);
        if (this.mac && this.mac !== mac) {
            const expectedMac = this.mac;
            //store reported mac, so a device object for the device that actually answered can be created.
            this.mac = mac;
            this.idFromMac();
            throw new WrongMacError(
                `${this.name} reported mac ${mac}, expected ${expectedMac}, probably ip ${this.ip} wrong and talking to wrong device?`,
            );
        }
        if (this.mac !== mac) {
            this.mac = mac;
            this.idFromMac();
            dirty = true;
        }

        if (this.model !== settings.ModelName) {
            const oldModel = this.model;
            this.model = settings.ModelName;
            if (oldModel) {
                this.adapter.log.warn(`${this.name} model changed from ${oldModel} to ${settings.ModelName}`);
            }
            throw new WrongModelError(`${this.name} model changed from ${oldModel} to ${settings.ModelName}`);
        }

        //let canSwitch = this.model.toUpperCase().includes('DSP') ||
        //    ((settings.ModuleTypes as Array<string>).find(t => t.indexOf('Plug') >= 0)); //if is socket, probably can switch on/off

        if (dirty) {
            await this.createDeviceObject();
        }

        //readResponseValue returns arrays for lists, getDeviceSettings is typed as strings.
        const actions = settings.SOAPActions as unknown;
        this.soapActions = Array.isArray(actions)
            ? actions.map((a: string) => a.substring(a.lastIndexOf('/') + 1))
            : [];

        const result = await super.identify();
        await this.applyNtpServer();
        return result;
    }

    /**
     * Sets the configured NTP server on the device, if it differs. Old devices use ntp1.dlink.com, which may stop
     * working some day. Without correct time the timestamps of the device are wrong.
     */
    protected async applyNtpServer(): Promise<void> {
        if (!this.ntpServer || !this.soapActions.includes('SetTimeSettings')) {
            return;
        }
        try {
            const settings = await this.client.getTimeSettings();
            if (settings.NTP === 'true' && settings.NTPServer === this.ntpServer) {
                return;
            }
            const success = await this.client.setTimeSettings({ ...settings, NTP: 'true', NTPServer: this.ntpServer });
            if (success) {
                this.adapter.log.info(
                    `${this.name}: NTP server changed from ${settings.NTPServer} to ${this.ntpServer}.`,
                );
            } else {
                this.adapter.log.warn(`${this.name}: could not set NTP server ${this.ntpServer}.`);
            }
        } catch (e: any) {
            this.adapter.log.warn(`${this.name}: could not set NTP server ${this.ntpServer}: ${e.message}`);
        }
    }
}

/**
 * Representation of a Soap Switch Device.
 */
export class SoapSwitch extends SoapDevice {
    //currently only know DSP-W215 as soap switch which has all those.
    hasTemp = true;
    hasPower = true;
    hasTotalPower = true;

    /**
     * Creates objects for the device.
     */
    async createObjects(): Promise<void> {
        await super.createObjects();
        //create state object, for plug this is writable
        await this.adapter.setObjectNotExistsAsync(this.id + Suffixes.state, {
            type: 'state',
            common: {
                name: 'state of plug',
                type: 'boolean',
                role: 'switch',
                read: true,
                write: true,
            },
            native: {},
        });
        await this.adapter.subscribeStatesAsync(this.id + Suffixes.state);

        //currently only know DSP-W215 which has Power & Temperature -> so create here every time.
        //if another socket without those measurements is added, need flags here.
        await this.adapter.setObjectNotExistsAsync(this.id + Suffixes.temperature, {
            type: 'state',
            common: {
                name: 'temperature',
                type: 'number',
                role: 'value.temperature',
                unit: '°C',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.adapter.setObjectNotExistsAsync(this.id + Suffixes.power, {
            type: 'state',
            common: {
                name: 'currentPowerConsumption',
                type: 'number',
                role: 'value.power',
                unit: 'W',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.adapter.setObjectNotExistsAsync(this.id + Suffixes.totalPower, {
            type: 'state',
            common: {
                name: 'totalPowerConsumption',
                type: 'number',
                role: 'value.energy.consumed',
                unit: 'kWh',
                read: true,
                write: false,
            },
            native: {},
        });
    }

    /**
     * Do polling here.
     *
     * @returns void
     */
    async onInterval(): Promise<void> {
        await super.onInterval();
        // if not ready -> communication did fail, will be retried on next poll.
        if (this.ready) {
            //check switch status:
            try {
                //first authenticated request of this poll -> log in again, if session expired.
                const val = (await this.withRelogin(() => this.client.state())) as boolean;
                await this.adapter.setStateChangedAsync(this.id + Suffixes.state, val, true);

                if (this.hasTemp) {
                    const temp = await this.client.temperature();
                    await this.adapter.setStateChangedAsync(this.id + Suffixes.temperature, temp, true);
                }
                if (this.hasPower) {
                    const power = await this.client.consumption();
                    await this.adapter.setStateChangedAsync(this.id + Suffixes.power, power, true);
                }
                if (this.hasTotalPower) {
                    const totalPower = await this.client.totalConsumption();
                    await this.adapter.setStateChangedAsync(this.id + Suffixes.totalPower, totalPower, true);
                }
            } catch (e: any) {
                await this.handleNetworkError(e);
            }
        }
    }

    /**
     * process a state change. Device will just try to switch plug. Children will have to overwrite this behaviour.
     *
     * @param id if of state
     * @param state new state
     */
    async handleStateChange(id: string, state: ioBroker.State): Promise<void> {
        await super.handleStateChange(id, state);

        if (id.endsWith(Suffixes.state)) {
            if (typeof state.val === 'boolean') {
                try {
                    const val = state.val;
                    await this.withRelogin(() => this.client.switch(val));
                    const newVal = (await this.client.state()) as boolean;
                    await this.adapter.setState(id, newVal, true);
                } catch (e: any) {
                    await this.handleNetworkError(e);
                }
            } else {
                this.adapter.log.warn('Wrong state type. Only boolean accepted for switch.');
            }
        }
    }
}

/**
 * Representation of a Soap Motion Detector Device.
 */
export class SoapMotionDetector extends SoapDevice {
    /**
     * Do polling here.
     *
     * @returns void
     */
    async onInterval(): Promise<void> {
        await super.onInterval();
        // if not ready -> communication did fail, will be retried on next poll.
        if (this.ready) {
            try {
                const lastDetection = await this.withRelogin(() => this.client.lastDetection());
                //const notChanged = await new Promise<boolean>((resolve, reject) => this.adapter.setStateChanged(this.id + Suffixes.lastDetected, lastDetection, true, (err: any, _id: string, notChanged: boolean) => err ? reject(err) : resolve(notChanged)));
                const notChanged = await new Promise<boolean>((resolve, reject) =>
                    this.adapter.setStateChanged(
                        this.id + Suffixes.lastDetected,
                        lastDetection,
                        true,
                        (err, _id, notChanged) => (err ? reject(err) : resolve(notChanged || false)),
                    ),
                );
                if (!notChanged) {
                    //timestamp did change -> we had a new detection!
                    await this.adapter.setState(this.id + Suffixes.state, true, true);
                } else {
                    await this.adapter.setStateChangedAsync(this.id + Suffixes.state, false, true);
                }
                const noMotion = Math.round((Date.now() - lastDetection) / 1000);
                await this.adapter.setStateChangedAsync(this.id + Suffixes.noMotion, noMotion, true);
            } catch (e: any) {
                await this.handleNetworkError(e);
            }
        }
    }

    /**
     * Creates objects for the device.
     */
    async createObjects(): Promise<void> {
        await super.createObjects();
        await this.adapter.setObjectNotExistsAsync(this.id + Suffixes.state, {
            type: 'state',
            common: {
                name: 'state',
                type: 'boolean',
                role: 'sensor.motion',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.adapter.setObjectNotExistsAsync(this.id + Suffixes.noMotion, {
            type: 'state',
            common: {
                name: 'No motion since',
                type: 'number',
                role: 'value.interval',
                unit: 'seconds',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.adapter.setObjectNotExistsAsync(this.id + Suffixes.lastDetected, {
            type: 'state',
            common: {
                name: 'lastDetected',
                type: 'number',
                role: 'value.time',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.adapter.setObjectNotExistsAsync(this.id + Suffixes.sensitivity, {
            type: 'state',
            common: {
                name: 'sensitivity',
                type: 'number',
                role: 'level',
                min: 0,
                max: 100,
                read: true,
                write: true,
            },
            native: {},
        });
        await this.adapter.setObjectNotExistsAsync(this.id + Suffixes.backoff, {
            type: 'state',
            common: {
                name: 'time without new detection after a detection',
                type: 'number',
                role: 'level',
                unit: 's',
                min: 1,
                read: true,
                write: true,
            },
            native: {},
        });
        await this.adapter.setObjectNotExistsAsync(this.id + Suffixes.detectionEnabled, {
            type: 'state',
            common: {
                name: 'motion detection enabled',
                type: 'boolean',
                role: 'switch.enable',
                read: true,
                write: true,
            },
            native: {},
        });
        for (const suffix of [Suffixes.sensitivity, Suffixes.backoff, Suffixes.detectionEnabled]) {
            await this.adapter.subscribeStatesAsync(this.id + suffix);
        }
    }

    /**
     * Identify the device and read settings of the detector.
     *
     * @returns true if identification successful
     */
    async identify(): Promise<boolean> {
        const result = await super.identify();
        await this.readDetectorSettings();
        return result;
    }

    /**
     * Reads the settings of the detector into the states.
     */
    private async readDetectorSettings(): Promise<void> {
        try {
            const settings = await this.withRelogin(() => this.client.getMotionDetectorSettings());
            await this.adapter.setState(this.id + Suffixes.sensitivity, settings.Sensitivity, true);
            await this.adapter.setState(this.id + Suffixes.backoff, settings.Backoff, true);
            await this.adapter.setState(this.id + Suffixes.detectionEnabled, settings.OPStatus, true);
        } catch (e: any) {
            this.adapter.log.warn(`${this.name}: could not read settings of motion detector: ${e.message}`);
        }
    }

    /**
     * Writes changed settings of the detector.
     *
     * @param id id of state
     * @param state new state
     */
    async handleStateChange(id: string, state: ioBroker.State): Promise<void> {
        await super.handleStateChange(id, state);

        const isSensitivity = id.endsWith(Suffixes.sensitivity);
        const isBackoff = id.endsWith(Suffixes.backoff);
        const isEnabled = id.endsWith(Suffixes.detectionEnabled);
        if (!isSensitivity && !isBackoff && !isEnabled) {
            return;
        }
        const value = isEnabled ? Boolean(state.val) : Math.round(Number(state.val));
        if (!isEnabled && (!Number.isFinite(value) || (value as number) < (isBackoff ? 1 : 0))) {
            this.adapter.log.warn(`${this.name}: invalid value ${state.val} for ${id}.`);
        } else {
            try {
                const settings = await this.withRelogin(() => this.client.getMotionDetectorSettings());
                if (isSensitivity) {
                    settings.Sensitivity = Math.min(value as number, 100);
                } else if (isBackoff) {
                    settings.Backoff = value as number;
                } else {
                    settings.OPStatus = value as boolean;
                }
                if (!(await this.client.setMotionDetectorSettings(settings))) {
                    this.adapter.log.warn(`${this.name}: device did not accept ${state.val} for ${id}.`);
                }
            } catch (e: any) {
                this.adapter.log.warn(`${this.name}: could not change settings of motion detector: ${e.message}`);
            }
        }
        //confirm the values the device really uses:
        await this.readDetectorSettings();
    }
}
