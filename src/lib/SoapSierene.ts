//Control of Sirens possible because of mtfluds work here: https://github.com/mtflud/DCH-S220-Web-Control
import {Suffixes} from './suffixes';
import {SoapDevice} from './soapDevice';

export class SoapSieren extends SoapDevice {
    soundToPlay = 1;
    volume = 100;
    duration = 10;

    /**
     * process a state change. Device will just try to switch plug. Childs will have to overwrite this behaviour.
     * @param id
     * @param state
     */
    async handleStateChange(id : string, state : ioBroker.State) : Promise<void> {
        await super.handleStateChange(id, state);

        if (id.endsWith(Suffixes.state)) {
            if (typeof state.val === 'boolean') {
                try {
                    await this.client.switch(state.val);
                    const newVal = (await this.client.state()) as boolean;
                    await this.adapter.setStateAsync(id, newVal, true);
                } catch(e: any) {
                    await this.handleNetworkError(e);
                }
            } else {
                this.adapter.log.warn('Wrong state type. Only boolean accepted for switch.');
            }
        } else {
            if (id.endsWith(Suffixes.soundType)) {
                if (typeof state.val === 'number' && state.val >= 1 && state.val <= 6) {
                    this.soundToPlay = state.val;
                } else {
                    this.adapter.log.warn(`Wrong value ${state.val} for sound. Expected number in range 1-6 for ${id}`);
                }
            } else if (id.endsWith(Suffixes.soundVolume)) {
                if (typeof state.val === 'number' && state.val >= 1 && state.val <= 100) {
                    this.volume = state.val;
                } else {
                    this.adapter.log.warn(`Wrong value ${state.val} for volume. Expected number in range 1-100 for ${id}`);
                }
            } else if (id.endsWith(Suffixes.soundDuration)) {
                if (typeof state.val === 'number' && state.val >= 1 && state.val <= 88888) {
                    this.duration = state.val;
                } else {
                    this.adapter.log.warn(`Wrong value ${state.val} for duration. Expected number in range 1-88888 (where 88888 means infinite) for ${id}`);
                }
            } else {
                this.adapter.log.warn(`State ${id} set to ${state.val} and ack=false, but can't control anything with it.`);
            }
        }
    }

    /**
     * Creates objects for the device.
     */
    async createObjects() : Promise<void> {
        await super.createObjects();

        //siren uses "state" to switch sirene on/off (or report state)
        await this.adapter.setObjectNotExistsAsync(this.id + Suffixes.state, {
            type: 'state',
            common: {
                name: 'state of sirene',
                type: 'boolean',
                role: 'switch',
                read: true,
                write: true
            },
            native: {}
        });
        await this.adapter.subscribeStatesAsync(this.id + Suffixes.state);

        await this.adapter.setObjectNotExistsAsync(this.id + Suffixes.soundType, {
            type: 'state',
            common: {
                name: 'sound to play on next play',
                type: 'number',
                role: 'level.mode.sound',
                read: true,
                write: true,
                min: 1,
                max: 6,
                states: {
                    1: 'EMERGENCY', 2: 'FIRE', 3: 'AMBULANCE',
                    4: 'POLICE', 5: 'DOOR_CHIME', 6: 'BEEP'
                }
            },
            native: {}
        });
        await this.adapter.subscribeStatesAsync(this.id + Suffixes.soundType);

        await this.adapter.setObjectNotExistsAsync(this.id + Suffixes.soundVolume, {
            type: 'state',
            common: {
                name: 'volume of sirene on next play',
                type: 'number',
                role: 'level.volume',
                read: true,
                write: true,
                min: 1,
                max: 100
            },
            native: {}
        });
        await this.adapter.subscribeStatesAsync(this.id + Suffixes.soundVolume);

        await this.adapter.setObjectNotExistsAsync(this.id + Suffixes.soundDuration, {
            type: 'state',
            common: {
                name: 'duration of sirene on next play (88888 = infinite)',
                type: 'number',
                role: 'level.timer',
                read: true,
                write: true,
                unit: 's',
                min: 1,
                max: 88888
            },
            native: {}
        });
        await this.adapter.subscribeStatesAsync(this.id + Suffixes.soundVolume);
    }
}