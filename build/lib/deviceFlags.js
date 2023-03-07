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
var deviceFlags_exports = {};
__export(deviceFlags_exports, {
  DeviceFlags: () => DeviceFlags
});
module.exports = __toCommonJS(deviceFlags_exports);
const DeviceFlags = {
  "DSP-W215": {
    type: "Smart plug",
    canSwitchOnOff: true,
    hasTemp: true,
    hasPower: true,
    hasTotalPower: true,
    hasLastDetected: false
  },
  "DCH-S150": {
    type: "Motion detection",
    canSwitchOnOff: false,
    hasTemp: false,
    hasPower: false,
    hasTotalPower: false,
    hasLastDetected: true
  },
  "DCH-S160": {
    type: "Water detection",
    canSwitchOnOff: false,
    hasTemp: false,
    hasPower: false,
    hasTotalPower: false,
    hasLastDetected: true
  },
  "DSP-W115": {
    type: "Smart plug",
    canSwitchOnOff: true,
    hasTemp: false,
    hasPower: false,
    hasTotalPower: false,
    hasLastDetected: false
  },
  "DSP-W118": {
    type: "Smart plug",
    canSwitchOnOff: true,
    hasTemp: false,
    hasPower: false,
    hasTotalPower: false,
    hasLastDetected: false
  },
  "DSP-W245": {
    type: "Smart plug",
    canSwitchOnOff: true,
    numSockets: 4,
    hasTemp: false,
    hasPower: false,
    hasTotalPower: false,
    hasLastDetected: false
  },
  "DCH-S220": {
    type: "Sirene",
    canSwitchOnOff: false,
    hasTemp: false,
    hasPower: false,
    hasTotalPower: false,
    hasLastDetected: false
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DeviceFlags
});
//# sourceMappingURL=deviceFlags.js.map
