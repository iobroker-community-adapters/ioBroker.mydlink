import {KnownDevices} from "./KnownDevices";

/**
 * Used to encrypt & decrypt pin. Necessary as long as js-controller can't decrypt for us in array structure.
 * @param key
 * @param value
 * @returns string
 */
function encryptDecrypt(key : string, value : string) {
    if (!value || !key) {
        return value;
    }
    let result = '';
    for (let i = 0; i < value.length; ++i) {
        result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
    }
    return result;
}

export class DeviceInfo {
    private static secret : string;

    /**
     * Used to set secret from main.ts -> so we can use it here to decrypt stuff if necessary.
     * @param secret
     */
    static setSecret (secret : string) {
        DeviceInfo.secret = secret;
    }

    /**
     * ip of device, might change in dhcp setups
     */
    ip: string;
    /**
     * pin of device, needed for login. Should be protected.
     */
    pinDecrypted = '';
    /**
     * pin of device, needed for login. Should be protected.
     */
    pinEncrypted = '';

    /**
     * Set Pin, please supply if it is encrypted or decrypted.
     * @param pin
     * @param encrypted
     */
    setPin(pin : string, encrypted = false) {
        if (encrypted) {
            this.pinEncrypted = pin;
            this.pinDecrypted = encryptDecrypt(DeviceInfo.secret, pin);
        } else {
            this.pinEncrypted = encryptDecrypt(DeviceInfo.secret, pin);
            this.pinDecrypted = pin;
        }
    }

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
     * did we login or do we need to try that again?
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
     * @param {string} mac
     * @returns {string}
     */
    idFromMac() {
        this.id = this.mac.toUpperCase().replace(/:/g, '');
    }

    /**
     * Create DeviceInfor only from Ip and Pin, old createDeviceFromIpAndPin
     * @param ip
     * @param pin
     * @constructor
     */
    constructor(ip: string, pin: string, pinEncrypted: boolean) {
        this.ip = ip;
        this.setPin(pin, pinEncrypted);
    }

}
