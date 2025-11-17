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
 * Make sure that the device has all required fields.
 *
 * @param tblDev The table device to sanitize.
 */
export function sanitizeTableDevice(tblDev: TableDevice): void {
    if (!tblDev.ip) {
        console.error('Device without IP found. This is not allowed.');
        tblDev.ip = 'INVALID';
    }
    if (!tblDev.pin) {
        tblDev.pin = 'INVALID';
    }
}
