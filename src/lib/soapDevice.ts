
import { Device } from './Device';
import { Suffixes } from './suffixes';
import { SoapClientInterface } from './Clients';
import { Mydlink } from '../main';

export class SoapDevice extends Device {
    client: SoapClientInterface;

    constructor(adapter : Mydlink, ip: string, pin: string, pinEncrypted: boolean) {
        super(adapter, ip, pin, pinEncrypted);
        this.client = new SoapClient();
    }

    /**
     * Creates objects for the device.
     */
    async createObjects() {
        await super.createObjects();
        //create state object, for plug this is writable for sensor not.
        await this.adapter.setObjectNotExistsAsync(this.id + Suffixes.reboot, {
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
        await this.adapter.subscribeStatesAsync(this.id + Suffixes.reboot);
    }

    /**
     * process a state change. Device will just try to switch plug. Childs will have to overwrite this behaviour.
     * @param id
     * @param state
     */
    async handleStateChange(id : string, _state : ioBroker.State) {
        if (this.loggedIn) {
            await this.login();
        }

        if (id.endsWith(Suffixes.reboot)) {
            try {
                await this.client.reboot();
                this.adapter.log.debug(`Send reboot request to ${this.name}`);
            } catch(e: any) {
                await this.handleNetworkError(e);
            }
        }
    }
}

export class SoapSwitch extends SoapDevice {
    //currently only know DSP-W215 as soap switch which has all those.
    hasTemp = true;
    hasPower = true;
    hasTotalPower = true;

    /**
     * Creates objects for the device.
     */
    async createObjects() {
        await super.createObjects();
        //create state object, for plug this is writable
        await this.adapter.setObjectNotExistsAsync(this.id + Suffixes.state, {
            type: 'state',
            common: {
                name: 'state of plug',
                type: 'boolean',
                role: 'switch',
                read: true,
                write: true
            },
            native: {}
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
                write: false
            },
            native: {}
        });

        await this.adapter.setObjectNotExistsAsync(this.id + Suffixes.power, {
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

        await this.adapter.setObjectNotExistsAsync(this.id + Suffixes.totalPower, {
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

    /**
     * Do polling here.
     * @returns {Promise<void>}
     */
    async onInterval() : Promise<void> {
        await super.onInterval();
        // if not ready -> communication did fail, will be retried on next poll.
        if (this.ready) {
            //check switch status:
            try {
                const val = await this.client.state() as boolean;
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
                    await this.adapter.setStateChangedAsync(this.id + Suffixes.power, totalPower, true);
                }
            } catch (e: any) {
                await this.handleNetworkError(e);
            }
        }
    }

    /**
     * process a state change. Device will just try to switch plug. Childs will have to overwrite this behaviour.
     * @param id
     * @param state
     */
    async handleStateChange(id : string, state : ioBroker.State) {
        await super.handleStateChange(id, state);

        if (typeof state.val === 'boolean') {
            if (id.endsWith(Suffixes.state)) {
                try {
                    await this.client.switch(state.val);
                    const newVal = (await this.client.state()) as boolean;
                    await this.adapter.setStateAsync(id, newVal, true);
                } catch(e: any) {
                    await this.handleNetworkError(e);
                }
            }
        } else {
            this.adapter.log.warn('Wrong state type. Only boolean accepted for switch.');
        }
    }
}

export class SoapMotionDetector extends SoapDevice {
    /**
     * Do polling here.
     * @returns {Promise<void>}
     */
    async onInterval() : Promise<void> {
        await super.onInterval();
        // if not ready -> communication did fail, will be retried on next poll.
        if (this.ready) {
            try {
                const lastDetection = await this.client.lastDetection();
                const result = await this.adapter.setStateChangedAsync(this.id + Suffixes.lastDetected, lastDetection, true);
                if (!result.notChanged) {
                    //timestamp did change -> we had a detection!
                    await this.adapter.setStateAsync(this.id + Suffixes.state, true, true);
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
    async createObjects() {
        await super.createObjects();
        await this.adapter.setObjectNotExistsAsync(this.id + Suffixes.state, {
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

        await this.adapter.setObjectNotExistsAsync(this.id + Suffixes.noMotion, {
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

        await this.adapter.setObjectNotExistsAsync(this.id + Suffixes.lastDetected, {
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
    }
}
