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
class DeviceInfo {
  /**
   * ip of device, might change in dhcp setups
   */
  ip;
  /**
   * pin of device, needed for login. Stored encrypted in the instance configuration by js-controller.
   */
  pin;
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
   * No login before this time (ms since epoch), e.g. because the device refuses logins.
   */
  loginBlockedUntil = 0;
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
   * NTP server to set on the device (only HNAP devices). Empty: keep setting of the device.
   */
  ntpServer = "";
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
   */
  constructor(ip, pin) {
    this.ip = ip;
    this.pin = pin || "INVALID";
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DeviceInfo
});
//# sourceMappingURL=DeviceInfo.js.map
