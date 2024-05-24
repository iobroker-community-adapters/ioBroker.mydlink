/**
 * Device Type from configuration.
 */
export type TableDevice = {
    name?: string;
    mac?: string;
    ip: string;
    pin: string;
    pollInterval?: number;
    enabled?: boolean;
    [key: string]: string | number | boolean | undefined;
}

/**
 * Make sure that the device has all required fields.
 * @param tblDev
 */
export function sanitizeTableDevice(tblDev: TableDevice) : void {
    if (!tblDev.ip) {
        console.error('Device without IP found. This is not allowed.');
        tblDev.ip = 'INVALID';
    }
    if (!tblDev.pin) {
        tblDev.pin = 'INVALID';
    }
}
