"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var DeviceInfo_exports = {};
__export(DeviceInfo_exports, {
  DeviceInfo: () => DeviceInfo
});
module.exports = __toCommonJS(DeviceInfo_exports);
function encryptDecrypt(key, value) {
  if (!value || !key) {
    return value;
  }
  let result = "";
  for (let i = 0; i < value.length; ++i) {
    result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
  }
  return result;
}
class DeviceInfo {
  /**
   * Create DeviceInfo only from Ip and Pin, old createDeviceFromIpAndPin
   * @param ip
   * @param pin
   * @param pinEncrypted - is the supplied pin encrypted?
   * @constructor
   */
  constructor(ip, pin, pinEncrypted) {
    /**
     * pin of device, needed for login. Should be protected.
     */
    this.pinDecrypted = "";
    /**
     * pin of device, needed for login. Should be protected.
     */
    this.pinEncrypted = "";
    /**
     * mac of device, used as base for ID. Should not change.
     */
    this.mac = "";
    /**
     * id of device, derived from MAC and usable as part of ioBroker object id.
     */
    this.id = "";
    /**
     * name of device, used for easier debug output. ;-) Should be derived from user / object settings
     */
    this.name = "";
    /**
     * did we log in or do we need to try that again?
     */
    this.loggedIn = false;
    /**
     * were we able to identify the device, yet, i.e. determine the model and see if right device is at the IP?
     */
    this.identified = false;
    /**
     * device is ready to report / receive commands
     */
    this.ready = false;
    /**
     * prevent to print loginError on every poll.
     */
    this.loginErrorPrinted = false;
    /**
     * Should we poll? If so, how often?
     */
    this.pollInterval = 3e4;
    /**
     * handle for the pollInterval. Used to clear it on exit.
     * (is a timeout handle!!) (might also be used to retry login, even if no polling is enabled!)
     */
    this.intervalHandle = void 0;
    /**
     * Model of the device.
     */
    this.model = "";
    /**
     * is device enabled? if not -> don't look for it.
     */
    this.enabled = true;
    /**
     * How to get rid of that here?? Hm...
     */
    this.isWebsocket = false;
    this.ip = ip;
    this.setPin(pin, pinEncrypted);
  }
  /**
   * Used to set secret from main.ts -> so we can use it here to decrypt stuff if necessary.
   * @param secret
   */
  static setSecret(secret) {
    DeviceInfo.secret = secret;
  }
  /**
   * Set Pin, please supply if it is encrypted or decrypted.
   * @param pin
   * @param encrypted
   */
  setPin(pin, encrypted = false) {
    if (!pin) {
      pin = "INVALID";
    }
    if (encrypted) {
      this.pinEncrypted = pin;
      this.pinDecrypted = encryptDecrypt(DeviceInfo.secret, pin);
    } else {
      this.pinEncrypted = encryptDecrypt(DeviceInfo.secret, pin);
      this.pinDecrypted = pin;
    }
  }
  /**
   * create id from mac:
   */
  idFromMac() {
    this.id = this.mac.toUpperCase().replace(/:/g, "");
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DeviceInfo
});
//# sourceMappingURL=DeviceInfo.js.map
