//state will be created if canSwitchOnOff: true or type includes 'detection'

import { WebSocketDevice } from './WebSocketDevice';
import { SoapMotionDetector, SoapSwitch } from './soapDevice';
import { SoapSiren } from './SoapSierene';
import type { Mydlink } from './mydlink';
import type { Device } from './Device';

export interface DeviceConstructor<T> {
    new (adapter: Mydlink, ip: string, pin: string, pinEncrypted: boolean): T;
}

export interface DeviceFlags<Type extends Device> {
    type: string;
    canSwitchOnOff?: boolean;
    hasTemp?: boolean;
    hasPower?: boolean;
    hasTotalPower?: boolean;
    hasLastDetected?: boolean;
    numSockets?: number;
    DeviceType: DeviceConstructor<Type>;
    moreSetup?(d: Device): void;
}

export const KnownDevices: Record<string, DeviceFlags<any>> = {
    'DSP-W215': {
        type: 'Smart plug',
        canSwitchOnOff: true,
        hasTemp: true,
        hasPower: true,
        hasTotalPower: true,
        hasLastDetected: false,
        DeviceType: SoapSwitch,
    },
    'DCH-S150': {
        type: 'Motion detection',
        canSwitchOnOff: false,
        hasTemp: false,
        hasPower: false,
        hasTotalPower: false,
        hasLastDetected: true,
        DeviceType: SoapMotionDetector,
    },
    'DCH-S220': {
        type: 'Sirene',
        canSwitchOnOff: false,
        hasTemp: false,
        hasPower: false,
        hasTotalPower: false,
        hasLastDetected: false,
        DeviceType: SoapSiren,
    },
    /*'DCH-S160-UNTESTED': {
        type: 'Water detection', //'sensor.alarm.flood'
        canSwitchOnOff: false,
        hasTemp: false,
        hasPower: false,
        hasTotalPower: false,
        hasLastDetected: true,
        DeviceType: Device
    },*/
    'DSP-W115': {
        type: 'Smart plug',
        canSwitchOnOff: true,
        hasTemp: false,
        hasPower: false,
        hasTotalPower: false,
        hasLastDetected: false,
        DeviceType: WebSocketDevice,
    },
    'DSP-W118': {
        type: 'Smart plug',
        canSwitchOnOff: true,
        hasTemp: false,
        hasPower: false,
        hasTotalPower: false,
        hasLastDetected: false,
        DeviceType: WebSocketDevice,
    },
    'DSP-W245': {
        type: 'Smart plug',
        canSwitchOnOff: true,
        numSockets: 4,
        hasTemp: false,
        hasPower: false,
        hasTotalPower: false,
        hasLastDetected: false,
        DeviceType: WebSocketDevice,
        moreSetup: device => {
            (device as WebSocketDevice).numSockets = 4;
        },
    },
};
