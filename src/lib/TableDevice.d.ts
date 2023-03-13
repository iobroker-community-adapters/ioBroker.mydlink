/**
 * Device Type from configuration.
 */
export type TableDevice = {
    name: string;
    mac: string;
    ip: string;
    pin: string;
    pollInterval: number;
    enabled: boolean;
    [key: string]: string | number | boolean;
}
