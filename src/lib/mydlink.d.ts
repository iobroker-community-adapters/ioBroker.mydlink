import * as utils from '@iobroker/adapter-core';
import type { Device } from './Device';
import type { AutoDetector } from './autoDetect';
import type { TableDevice } from './TableDevice';

declare class Mydlink extends utils.Adapter {
    devices: Array<Device>;
    configDevices: TableDevice[];
    autoDetector: AutoDetector | undefined;
    unloading: boolean;
    updateDeviceIp(mac: string, ip: string): Promise<void>;
    saveConfigDevices(devices: TableDevice[]): Promise<void>;
    deleteDeviceFull(device: Device): Promise<void>;
    identifyDevice(ip: string, pin: string): Promise<Device | undefined>;
}
