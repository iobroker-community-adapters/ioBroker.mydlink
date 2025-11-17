//state will be created if canSwitchOnOff: true or type includes 'detection'

import { WebSocketDevice } from './WebSocketDevice';
import { SoapMotionDetector, SoapSwitch } from './soapDevice';
import { SoapSiren } from './SoapSierene';
import type { Mydlink } from './mydlink';
import type { Device } from './Device';

/**
 * Constructor type for devices.
 */
export interface DeviceConstructor<T> {
    new (adapter: Mydlink, ip: string, pin: string, pinEncrypted: boolean): T;
}

/**
 * Flags and info about a device type.
 */
export interface DeviceFlags<Type extends Device> {
    /**
     * Type of device, human-readable.
     */
    type: string;
    /**
     * Indicates whether device can be switched on/off.
     */
    canSwitchOnOff?: boolean;
    /**
     * Indicates whether device has temperature sensor.
     */
    hasTemp?: boolean;
    /**
     * Indicates whether device has power measurement.
     */
    hasPower?: boolean;
    /**
     * Indicates whether device has total power measurement.
     */
    hasTotalPower?: boolean;
    /**
     * Indicates whether device has last detected timestamp.
     */
    hasLastDetected?: boolean;
    /**
     * Number of sockets the device has.
     */
    numSockets?: number;
    /**
     * Constructor of the device.
     */
    DeviceType: DeviceConstructor<Type>;

    /**
     * Additional setup function for device after creation.
     *
     * @param d The device to set up.
     */
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
