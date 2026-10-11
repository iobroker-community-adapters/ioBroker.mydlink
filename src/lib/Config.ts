import { isDeepStrictEqual } from 'node:util';
import type { DeviceInfo } from './DeviceInfo';
import type { TableDevice } from './TableDevice';

/**
 * Version of the stored configuration.
 * 1 (or missing): PINs were encrypted by the adapter and the old admin page themselves.
 * 2: PINs are encrypted by js-controller, because `devices.pin` is listed in `encryptedNative`.
 */
export const CONFIG_VERSION = 2;

/**
 * Secret old versions used, if system.config had none.
 */
export const LEGACY_SECRET = 'RJaeBLRPwvPfh5O';

/**
 * Native part of the instance configuration.
 */
export type MydlinkConfig = {
    /**
     * Configured devices.
     */
    devices: TableDevice[];
    /**
     * Version of the stored configuration, see CONFIG_VERSION.
     */
    configVersion?: number;
};

/**
 * Decrypts a PIN encrypted by old versions of the adapter or the old admin page.
 *
 * @param key secret from system.config
 * @param value encrypted PIN
 * @returns decrypted PIN
 */
export function legacyDecrypt(key: string, value: string): string {
    if (!value || !key) {
        return value;
    }
    let result = '';
    for (let i = 0; i < value.length; ++i) {
        result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
    }
    return result;
}

/**
 * Converts the devices of a configuration of version 1. Old versions stored the PIN encrypted, if the device had a
 * MAC, and in plain text otherwise.
 *
 * @param devices devices as stored in the instance object
 * @param secret secret from system.config
 * @returns devices with decrypted PINs
 */
export function migrateLegacyDevices(devices: TableDevice[], secret: string): TableDevice[] {
    return devices.map(device => {
        const { pinNotEncrypted, ...migrated } = device;
        if (migrated.mac && migrated.pin && !pinNotEncrypted) {
            migrated.pin = legacyDecrypt(secret, migrated.pin);
        }
        return migrated;
    });
}

/**
 * Creates the configuration entry of a device.
 *
 * @param device the device
 * @returns entry for the devices table of the configuration
 */
export function deviceToTableDevice(device: DeviceInfo): TableDevice {
    return {
        name: device.name,
        mac: device.mac,
        ip: device.ip,
        pin: device.pin,
        pollInterval: device.pollInterval,
        enabled: device.enabled,
        model: device.model,
        useWebSocket: device.isWebsocket,
        ntpServer: device.ntpServer,
    };
}

function normalize(device: TableDevice): Record<string, unknown> {
    return {
        name: device.name ?? '',
        mac: device.mac ?? '',
        ip: device.ip,
        pin: device.pin,
        pollInterval: Number(device.pollInterval),
        enabled: device.enabled !== false,
        model: device.model ?? '',
        useWebSocket: Boolean(device.useWebSocket),
        ntpServer: device.ntpServer ?? '',
    };
}

/**
 * Compares two device lists. Used to only write the configuration (which restarts the adapter) if something changed.
 *
 * @param a first list
 * @param b second list
 * @returns true if both lists contain the same devices in the same order
 */
export function sameTableDevices(a: TableDevice[], b: TableDevice[]): boolean {
    return isDeepStrictEqual(a.map(normalize), b.map(normalize));
}
