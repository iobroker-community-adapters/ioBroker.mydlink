import { Device } from './lib/Device';

export interface Mydlink extends ioBroker.Adapter {
    devices: Array<Device>;
}
