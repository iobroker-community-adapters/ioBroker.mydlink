/**
 * Device Type from configuration.
 */
export type TableDevice = {
    /**
     * Name of device.
     */
    name?: string;
    /**
     * MAC address of device.
     */
    mac?: string;
    /**
     * IP address of device.
     */
    ip: string;
    /**
     * PIN of device.
     */
    pin: string;
    /**
     * Polling interval in seconds, optional
     */
    pollInterval?: number;
    /**
     * Enable or disable this device, optional
     */
    enabled?: boolean;
    /**
     * Additional properties.
     */
    [key: string]: string | number | boolean | undefined;
};

/**
 * Bring MAC address into the format used everywhere in the adapter: upper case, separated by colons.
 * Some devices (e.g. DSP-W115) announce their MAC without colons.
 *
 * @param mac MAC address in any format
 * @returns normalized MAC address, input unchanged (but upper case) if it is not a valid MAC
 */
export function normalizeMac(mac: string): string {
    const hex = mac.replace(/[^0-9a-f]/gi, '').toUpperCase();
    if (hex.length !== 12) {
        return mac.toUpperCase();
    }
    return hex.match(/.{2}/g)!.join(':');
}

/**
 * Make sure that the device has all required fields.
 *
 * @param tblDev The table device to sanitize.
 * @returns true if the MAC address was changed, i.e. config needs to be updated.
 */
export function sanitizeTableDevice(tblDev: TableDevice): boolean {
    if (!tblDev.ip) {
        console.error('Device without IP found. This is not allowed.');
        tblDev.ip = 'INVALID';
    }
    if (!tblDev.pin) {
        tblDev.pin = 'INVALID';
    }
    if (tblDev.mac) {
        const mac = normalizeMac(tblDev.mac);
        if (mac !== tblDev.mac) {
            tblDev.mac = mac;
            return true;
        }
    }
    return false;
}
