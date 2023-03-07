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
var soapDevice_exports = {};
__export(soapDevice_exports, {
  SoapDevice: () => SoapDevice,
  SoapMotionDetector: () => SoapMotionDetector,
  SoapSwitch: () => SoapSwitch
});
module.exports = __toCommonJS(soapDevice_exports);
var import_Device = require("./Device");
var import_suffixes = require("./suffixes");
var import_Clients = require("./Clients");
class SoapDevice extends import_Device.Device {
  constructor(adapter, ip, pin, pinEncrypted) {
    super(adapter, ip, pin, pinEncrypted);
    this.client = new import_Clients.SoapClient();
  }
}
class SoapSwitch extends SoapDevice {
  constructor() {
    super(...arguments);
    this.hasTemp = true;
    this.hasPower = true;
    this.hasTotalPower = true;
  }
  async onInterval() {
    await super.onInterval();
    if (this.ready) {
      const val = await this.client.state();
      await this.adapter.setStateChangedAsync(this.id + import_suffixes.Suffixes.state, val, true);
      if (this.hasTemp) {
        const temp = await this.client.temperature();
        await this.adapter.setStateChangedAsync(this.id + import_suffixes.Suffixes.temperature, temp, true);
      }
      if (this.hasPower) {
        const power = await this.client.consumption();
        await this.adapter.setStateChangedAsync(this.id + import_suffixes.Suffixes.power, power, true);
      }
      if (this.hasTotalPower) {
        const totalPower = await this.client.totalConsumption();
        await this.adapter.setStateChangedAsync(this.id + import_suffixes.Suffixes.power, totalPower, true);
      }
    }
  }
}
class SoapMotionDetector extends SoapDevice {
  async onInterval() {
    await super.onInterval();
    if (this.ready) {
      const lastDetection = await this.client.lastDetection();
      const result = await this.adapter.setStateChangedAsync(this.id + import_suffixes.Suffixes.lastDetected, lastDetection, true);
      if (!result.notChanged) {
        await this.adapter.setStateAsync(this.id + import_suffixes.Suffixes.state, true, true);
      } else {
        await this.adapter.setStateChangedAsync(this.id + import_suffixes.Suffixes.state, false, true);
      }
      const noMotion = Math.round((Date.now() - lastDetection) / 1e3);
      await this.adapter.setStateChangedAsync(this.id + import_suffixes.Suffixes.noMotion, noMotion, true);
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  SoapDevice,
  SoapMotionDetector,
  SoapSwitch
});
//# sourceMappingURL=soapDevice.js.map
