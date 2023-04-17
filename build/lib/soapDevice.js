"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
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
var import_soapclient = __toESM(require("../../lib/soapclient"));
var import_KnownDevices = require("./KnownDevices");
class SoapDevice extends import_Device.Device {
  constructor(adapter, ip, pin, pinEncrypted) {
    super(adapter, ip, pin, pinEncrypted);
    this.client = (0, import_soapclient.default)({
      user: "Admin",
      password: this.pinDecrypted,
      url: "http://" + this.ip + "/HNAP1"
    });
  }
  async createObjects() {
    await super.createObjects();
    await this.adapter.setObjectNotExistsAsync(this.id + import_suffixes.Suffixes.reboot, {
      type: "state",
      common: {
        name: "reboot device",
        type: "boolean",
        role: "button",
        read: false,
        write: true
      },
      native: {}
    });
    await this.adapter.subscribeStatesAsync(this.id + import_suffixes.Suffixes.reboot);
  }
  async handleStateChange(id, _state) {
    if (this.loggedIn) {
      await this.login();
    }
    if (id.endsWith(import_suffixes.Suffixes.reboot)) {
      try {
        await this.client.reboot();
        this.adapter.log.debug(`Send reboot request to ${this.name}`);
      } catch (e) {
        await this.handleNetworkError(e);
      }
    }
  }
  async identify() {
    const settings = await this.client.getDeviceSettings();
    let dirty = false;
    this.adapter.log.debug(this.name + " returned following device settings: " + JSON.stringify(settings, null, 2));
    if (this.mac && this.mac !== settings.DeviceMacId) {
      throw new import_Device.WrongMacError(`${this.name} reported mac ${settings.DeviceMacId}, expected ${this.mac}, probably ip ${this.ip} wrong and talking to wrong device?`);
    }
    if (this.mac !== settings.DeviceMacId) {
      this.mac = settings.DeviceMacId.toUpperCase();
      dirty = true;
    }
    if (this.model && this.model !== settings.ModelName) {
      this.model = settings.ModelName;
      this.adapter.log.warn(`${this.name} model changed from ${this.model} to ${settings.ModelName}`);
      throw new import_Device.WrongModelError(`${this.name} model changed from ${this.model} to ${settings.ModelName}`);
    }
    if (this.model !== settings.ModelName) {
      this.model = settings.ModelName;
      dirty = true;
    }
    if (!import_KnownDevices.KnownDevices[this.model]) {
      const xmls = await this.client.getDeviceDescriptionXML();
      await this.sendModelInfoToSentry(xmls);
    }
    if (dirty) {
      await this.createDeviceObject();
    }
    return super.identify();
  }
}
class SoapSwitch extends SoapDevice {
  constructor() {
    super(...arguments);
    this.hasTemp = true;
    this.hasPower = true;
    this.hasTotalPower = true;
  }
  async createObjects() {
    await super.createObjects();
    await this.adapter.setObjectNotExistsAsync(this.id + import_suffixes.Suffixes.state, {
      type: "state",
      common: {
        name: "state of plug",
        type: "boolean",
        role: "switch",
        read: true,
        write: true
      },
      native: {}
    });
    await this.adapter.subscribeStatesAsync(this.id + import_suffixes.Suffixes.state);
    await this.adapter.setObjectNotExistsAsync(this.id + import_suffixes.Suffixes.temperature, {
      type: "state",
      common: {
        name: "temperature",
        type: "number",
        role: "value.temperature",
        unit: "\xB0C",
        read: true,
        write: false
      },
      native: {}
    });
    await this.adapter.setObjectNotExistsAsync(this.id + import_suffixes.Suffixes.power, {
      type: "state",
      common: {
        name: "currentPowerConsumption",
        type: "number",
        role: "value.power",
        unit: "W",
        read: true,
        write: false
      },
      native: {}
    });
    await this.adapter.setObjectNotExistsAsync(this.id + import_suffixes.Suffixes.totalPower, {
      type: "state",
      common: {
        name: "totalPowerConsumption",
        type: "number",
        role: "value.power.consumption",
        unit: "kWh",
        read: true,
        write: false
      },
      native: {}
    });
  }
  async onInterval() {
    await super.onInterval();
    if (this.ready) {
      try {
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
      } catch (e) {
        await this.handleNetworkError(e);
      }
    }
  }
  async handleStateChange(id, state) {
    await super.handleStateChange(id, state);
    if (typeof state.val === "boolean") {
      if (id.endsWith(import_suffixes.Suffixes.state)) {
        try {
          await this.client.switch(state.val);
          const newVal = await this.client.state();
          await this.adapter.setStateAsync(id, newVal, true);
        } catch (e) {
          await this.handleNetworkError(e);
        }
      }
    } else {
      this.adapter.log.warn("Wrong state type. Only boolean accepted for switch.");
    }
  }
}
class SoapMotionDetector extends SoapDevice {
  async onInterval() {
    await super.onInterval();
    if (this.ready) {
      try {
        const lastDetection = await this.client.lastDetection();
        const notChanged = await new Promise((resolve, reject) => this.adapter.setStateChanged(this.id + import_suffixes.Suffixes.lastDetected, lastDetection, true, (err, _id, notChanged2) => err ? reject(err) : resolve(notChanged2 || false)));
        if (!notChanged) {
          await this.adapter.setStateAsync(this.id + import_suffixes.Suffixes.state, true, true);
        } else {
          await this.adapter.setStateChangedAsync(this.id + import_suffixes.Suffixes.state, false, true);
        }
        const noMotion = Math.round((Date.now() - lastDetection) / 1e3);
        await this.adapter.setStateChangedAsync(this.id + import_suffixes.Suffixes.noMotion, noMotion, true);
      } catch (e) {
        await this.handleNetworkError(e);
      }
    }
  }
  async createObjects() {
    await super.createObjects();
    await this.adapter.setObjectNotExistsAsync(this.id + import_suffixes.Suffixes.state, {
      type: "state",
      common: {
        name: "state",
        type: "boolean",
        role: "sensor.motion",
        read: true,
        write: false
      },
      native: {}
    });
    await this.adapter.setObjectNotExistsAsync(this.id + import_suffixes.Suffixes.noMotion, {
      type: "state",
      common: {
        name: "No motion since",
        type: "number",
        role: "value.interval",
        unit: "seconds",
        read: true,
        write: false
      },
      native: {}
    });
    await this.adapter.setObjectNotExistsAsync(this.id + import_suffixes.Suffixes.lastDetected, {
      type: "state",
      common: {
        name: "lastDetected",
        type: "number",
        role: "value.time",
        read: true,
        write: false
      },
      native: {}
    });
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  SoapDevice,
  SoapMotionDetector,
  SoapSwitch
});
//# sourceMappingURL=soapDevice.js.map
