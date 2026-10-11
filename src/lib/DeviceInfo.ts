/**
 * Information about a device.
 */
export class DeviceInfo {
    /**
     * ip of device, might change in dhcp setups
     */
    ip: string;
    /**
     * pin of device, needed for login. Stored encrypted in the instance configuration by js-controller.
     */
    pin: string;

    /**
     * mac of device, used as base for ID. Should not change.
     */
    mac = '';
    /**
     * id of device, derived from MAC and usable as part of ioBroker object id.
     */
    id = '';
    /**
     * name of device, used for easier debug output. ;-) Should be derived from user / object settings
     */
    name = '';
    /**
     * did we log in or do we need to try that again?
     */
    loggedIn = false;
    /**
     * were we able to identify the device, yet, i.e. determine the model and see if right device is at the IP?
     */
    identified = false;
    /**
     * device is ready to report / receive commands
     */
    ready = false;
    /**
     * prevent to print loginError on every poll.
     */
    loginErrorPrinted = false;
    /**
     * No login before this time (ms since epoch), e.g. because the device refuses logins.
     */
    loginBlockedUntil = 0;
    /**
     * Should we poll? If so, how often?
     */
    pollInterval = 30000;
    /**
     * handle for the pollInterval. Used to clear it on exit.
     * (is a timeout handle!!) (might also be used to retry login, even if no polling is enabled!)
     */
    intervalHandle: ioBroker.Timeout | undefined = undefined;
    /**
     * Model of the device.
     */
    model = '';
    /**
     * is device enabled? if not -> don't look for it.
     */
    enabled = true;
    /**
     * How to get rid of that here?? Hm...
     */
    isWebsocket = false;

    /**
     * create id from mac:
     */
    idFromMac(): void {
        this.id = this.mac.toUpperCase().replace(/:/g, '');
    }

    /**
     * Create DeviceInfo only from Ip and Pin, old createDeviceFromIpAndPin
     *
     * @param ip ip of the device
     * @param pin pin of the device
     */
    constructor(ip: string, pin: string) {
        this.ip = ip;
        this.pin = pin || 'INVALID';
    }
}
