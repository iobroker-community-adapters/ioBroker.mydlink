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
  static secret;
  /**
   * Used to set secret from main.ts -> so we can use it here to decrypt stuff if necessary.
   *
   * @param secret the secret use for encryption / decryption
   */
  static setSecret(secret) {
    DeviceInfo.secret = secret;
  }
  /**
   * ip of device, might change in dhcp setups
   */
  ip;
  /**
   * pin of device, needed for login. Should be protected.
   */
  pinDecrypted = "";
  /**
   * pin of device, needed for login. Should be protected.
   */
  pinEncrypted = "";
  /**
   * Set Pin, please supply if it is encrypted or decrypted.
   *
   * @param pin the pin to set in device information
   * @param encrypted is the supplied pin encrypted?
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
   * mac of device, used as base for ID. Should not change.
   */
  mac = "";
  /**
   * id of device, derived from MAC and usable as part of ioBroker object id.
   */
  id = "";
  /**
   * name of device, used for easier debug output. ;-) Should be derived from user / object settings
   */
  name = "";
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
   * Should we poll? If so, how often?
   */
  pollInterval = 3e4;
  /**
   * handle for the pollInterval. Used to clear it on exit.
   * (is a timeout handle!!) (might also be used to retry login, even if no polling is enabled!)
   */
  intervalHandle = void 0;
  /**
   * Model of the device.
   */
  model = "";
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
  idFromMac() {
    this.id = this.mac.toUpperCase().replace(/:/g, "");
  }
  /**
   * Create DeviceInfo only from Ip and Pin, old createDeviceFromIpAndPin
   *
   * @param ip ip of the device
   * @param pin pin of the device
   * @param pinEncrypted - is the supplied pin encrypted?
   */
  constructor(ip, pin, pinEncrypted) {
    this.ip = ip;
    this.setPin(pin, pinEncrypted);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DeviceInfo
});
//# sourceMappingURL=DeviceInfo.js.map
