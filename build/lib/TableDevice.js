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
var TableDevice_exports = {};
__export(TableDevice_exports, {
  normalizeMac: () => normalizeMac,
  sanitizeTableDevice: () => sanitizeTableDevice
});
module.exports = __toCommonJS(TableDevice_exports);
function normalizeMac(mac) {
  const hex = mac.replace(/[^0-9a-f]/gi, "").toUpperCase();
  if (hex.length !== 12) {
    return mac.toUpperCase();
  }
  return hex.match(/.{2}/g).join(":");
}
function sanitizeTableDevice(tblDev) {
  if (!tblDev.ip) {
    console.error("Device without IP found. This is not allowed.");
    tblDev.ip = "INVALID";
  }
  if (!tblDev.pin) {
    tblDev.pin = "INVALID";
  }
  if (tblDev.mac) {
    const mac = normalizeMac(tblDev.mac);
    if (mac !== tblDev.mac) {
      tblDev.mac = mac;
      return true;
    }
  }
  return false;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  normalizeMac,
  sanitizeTableDevice
});
//# sourceMappingURL=TableDevice.js.map
