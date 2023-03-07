
import { Device } from './Device';
import {Suffixes} from './suffixes';
import {SoapClient} from './Clients';
import {Mydlink} from '../main';

export class SoapDevice extends Device {
    client: SoapClient;

    constructor(adapter : Mydlink, ip: string, pin: string, pinEncrypted: boolean) {
        super(adapter, ip, pin, pinEncrypted);
        this.client = new SoapClient();
    }
}

export class SoapSwitch extends SoapDevice {
    //currently only know DSP-W215 as soap switch which has all those.
    hasTemp = true;
    hasPower = true;
    hasTotalPower = true;

    /**
     * Do polling here.
     * @returns {Promise<void>}
     */
    async onInterval() : Promise<void> {
        await super.onInterval();
        // if not ready -> communication did fail, will be retried on next poll.
        if (this.ready) {
            //check switch status:
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
        }
    }
}