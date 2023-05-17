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
  constructor(ip, pin, pinEncrypted) {
    this.pinDecrypted = "";
    this.pinEncrypted = "";
    this.mac = "";
    this.id = "";
    this.name = "";
    this.loggedIn = false;
    this.identified = false;
    this.ready = false;
    this.loginErrorPrinted = false;
    this.pollInterval = 3e4;
    this.intervalHandle = void 0;
    this.model = "";
    this.enabled = true;
    this.isWebsocket = false;
    this.ip = ip;
    this.setPin(pin, pinEncrypted);
  }
  static setSecret(secret) {
    DeviceInfo.secret = secret;
  }
  setPin(pin, encrypted = false) {
    if (encrypted) {
      this.pinEncrypted = pin;
      this.pinDecrypted = encryptDecrypt(DeviceInfo.secret, pin);
    } else {
      this.pinEncrypted = encryptDecrypt(DeviceInfo.secret, pin);
      this.pinDecrypted = pin;
    }
  }
  idFromMac() {
    this.id = this.mac.toUpperCase().replace(/:/g, "");
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DeviceInfo
});
//# sourceMappingURL=DeviceInfo.js.map
