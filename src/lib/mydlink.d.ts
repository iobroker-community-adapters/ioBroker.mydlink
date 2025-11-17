import * as utils from '@iobroker/adapter-core';
import type { Device } from './Device';

declare class Mydlink extends utils.Adapter {
    devices: Array<Device>;
}
