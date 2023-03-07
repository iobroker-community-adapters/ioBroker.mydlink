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
var suffixes_exports = {};
__export(suffixes_exports, {
  Suffixes: () => Suffixes
});
module.exports = __toCommonJS(suffixes_exports);
const Suffixes = {
  unreachable: ".unreachable",
  enabled: ".enabled",
  state: ".state",
  power: ".currentPower",
  totalPower: ".totalPower",
  temperature: ".temperature",
  lastDetected: ".lastDetected",
  noMotion: ".no_motion",
  reboot: ".reboot"
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Suffixes
});
//# sourceMappingURL=suffixes.js.map
