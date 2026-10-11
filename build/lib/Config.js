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
var Config_exports = {};
__export(Config_exports, {
  CONFIG_VERSION: () => CONFIG_VERSION,
  LEGACY_SECRET: () => LEGACY_SECRET,
  deviceToTableDevice: () => deviceToTableDevice,
  legacyDecrypt: () => legacyDecrypt,
  migrateLegacyDevices: () => migrateLegacyDevices,
  sameTableDevices: () => sameTableDevices
});
module.exports = __toCommonJS(Config_exports);
var import_node_util = require("node:util");
const CONFIG_VERSION = 2;
const LEGACY_SECRET = "RJaeBLRPwvPfh5O";
function legacyDecrypt(key, value) {
  if (!value || !key) {
    return value;
  }
  let result = "";
  for (let i = 0; i < value.length; ++i) {
    result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
  }
  return result;
}
function migrateLegacyDevices(devices, secret) {
  return devices.map((device) => {
    const { pinNotEncrypted, ...migrated } = device;
    if (migrated.mac && migrated.pin && !pinNotEncrypted) {
      migrated.pin = legacyDecrypt(secret, migrated.pin);
    }
    return migrated;
  });
}
function deviceToTableDevice(device) {
  return {
    name: device.name,
    mac: device.mac,
    ip: device.ip,
    pin: device.pin,
    pollInterval: device.pollInterval,
    enabled: device.enabled,
    model: device.model,
    useWebSocket: device.isWebsocket,
    ntpServer: device.ntpServer
  };
}
function normalize(device) {
  var _a, _b, _c, _d;
  return {
    name: (_a = device.name) != null ? _a : "",
    mac: (_b = device.mac) != null ? _b : "",
    ip: device.ip,
    pin: device.pin,
    pollInterval: Number(device.pollInterval),
    enabled: device.enabled !== false,
    model: (_c = device.model) != null ? _c : "",
    useWebSocket: Boolean(device.useWebSocket),
    ntpServer: (_d = device.ntpServer) != null ? _d : ""
  };
}
function sameTableDevices(a, b) {
  return (0, import_node_util.isDeepStrictEqual)(a.map(normalize), b.map(normalize));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CONFIG_VERSION,
  LEGACY_SECRET,
  deviceToTableDevice,
  legacyDecrypt,
  migrateLegacyDevices,
  sameTableDevices
});
//# sourceMappingURL=Config.js.map
