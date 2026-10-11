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
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
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
var import_TableDevice = require("./TableDevice");
var import_soapclient = __toESM(require("./soapclient"));
class SoapDevice extends import_Device.Device {
  client;
  /**
   * SOAP actions the device supports, e.g. 'SetTimeSettings'.
   */
  soapActions = [];
  /**
   * Creates a new Soap Device.
   *
   * @param adapter reference to adapter
   * @param ip ip of device
   * @param pin pin of device
   */
  constructor(adapter, ip, pin) {
    super(adapter, ip, pin);
    this.client = (0, import_soapclient.default)({
      user: "Admin",
      password: this.pin,
      url: `http://${this.ip}/HNAP1`
    });
  }
  /**
   * Creates objects for the device.
   */
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
  /**
   * Run an action on the device. The device closes the session after a few minutes without requests
   * (i.e. if polling is slower than that or disabled), so log in again once and retry if it was rejected with 403.
   *
   * @param action the action to execute
   * @returns result of the action
   */
  async withRelogin(action) {
    try {
      return await action();
    } catch (e) {
      if ((0, import_Device.processNetworkError)(e) !== 403) {
        throw e;
      }
      this.adapter.log.debug(`${this.name} session expired, logging in again.`);
      this.loggedIn = false;
      await this.login();
      return action();
    }
  }
  /**
   * process a state change. Device will just try to switch plug. Children will have to overwrite this behaviour.
   *
   * @param id if of state
   * @param state new state
   */
  async handleStateChange(id, state) {
    if (!this.loggedIn) {
      await this.login();
    }
    if (id.endsWith(import_suffixes.Suffixes.reboot) && state.val) {
      try {
        await this.withRelogin(() => this.client.reboot());
        this.adapter.log.debug(`Send reboot request to ${this.name}`);
      } catch (e) {
        await this.handleNetworkError(e);
      }
    }
  }
  /**
   * Identify the device, i.e. check mac and model.
   *
   * @returns true if identification successful
   */
  async identify() {
    const settings = await this.client.getDeviceSettings();
    let dirty = false;
    this.adapter.log.debug(`${this.name} returned following device settings: ${JSON.stringify(settings, null, 2)}`);
    const mac = (0, import_TableDevice.normalizeMac)(settings.DeviceMacId);
    if (this.mac && this.mac !== mac) {
      const expectedMac = this.mac;
      this.mac = mac;
      this.idFromMac();
      throw new import_Device.WrongMacError(
        `${this.name} reported mac ${mac}, expected ${expectedMac}, probably ip ${this.ip} wrong and talking to wrong device?`
      );
    }
    if (this.mac !== mac) {
      this.mac = mac;
      this.idFromMac();
      dirty = true;
    }
    if (this.model !== settings.ModelName) {
      const oldModel = this.model;
      this.model = settings.ModelName;
      if (oldModel) {
        this.adapter.log.warn(`${this.name} model changed from ${oldModel} to ${settings.ModelName}`);
      }
      throw new import_Device.WrongModelError(`${this.name} model changed from ${oldModel} to ${settings.ModelName}`);
    }
    if (dirty) {
      await this.createDeviceObject();
    }
    const actions = settings.SOAPActions;
    this.soapActions = Array.isArray(actions) ? actions.map((a) => a.substring(a.lastIndexOf("/") + 1)) : [];
    const result = await super.identify();
    await this.applyNtpServer();
    return result;
  }
  /**
   * Sets the configured NTP server on the device, if it differs. Old devices use ntp1.dlink.com, which may stop
   * working some day. Without correct time the timestamps of the device are wrong.
   */
  async applyNtpServer() {
    if (!this.ntpServer || !this.soapActions.includes("SetTimeSettings")) {
      return;
    }
    try {
      const settings = await this.client.getTimeSettings();
      if (settings.NTP === "true" && settings.NTPServer === this.ntpServer) {
        return;
      }
      const success = await this.client.setTimeSettings({ ...settings, NTP: "true", NTPServer: this.ntpServer });
      if (success) {
        this.adapter.log.info(
          `${this.name}: NTP server changed from ${settings.NTPServer} to ${this.ntpServer}.`
        );
      } else {
        this.adapter.log.warn(`${this.name}: could not set NTP server ${this.ntpServer}.`);
      }
    } catch (e) {
      this.adapter.log.warn(`${this.name}: could not set NTP server ${this.ntpServer}: ${e.message}`);
    }
  }
}
class SoapSwitch extends SoapDevice {
  //currently only know DSP-W215 as soap switch which has all those.
  hasTemp = true;
  hasPower = true;
  hasTotalPower = true;
  /**
   * Creates objects for the device.
   */
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
        role: "value.energy.consumed",
        unit: "kWh",
        read: true,
        write: false
      },
      native: {}
    });
  }
  /**
   * Do polling here.
   *
   * @returns void
   */
  async onInterval() {
    await super.onInterval();
    if (this.ready) {
      try {
        const val = await this.withRelogin(() => this.client.state());
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
          await this.adapter.setStateChangedAsync(this.id + import_suffixes.Suffixes.totalPower, totalPower, true);
        }
      } catch (e) {
        await this.handleNetworkError(e);
      }
    }
  }
  /**
   * process a state change. Device will just try to switch plug. Children will have to overwrite this behaviour.
   *
   * @param id if of state
   * @param state new state
   */
  async handleStateChange(id, state) {
    await super.handleStateChange(id, state);
    if (id.endsWith(import_suffixes.Suffixes.state)) {
      if (typeof state.val === "boolean") {
        try {
          const val = state.val;
          await this.withRelogin(() => this.client.switch(val));
          const newVal = await this.client.state();
          await this.adapter.setState(id, newVal, true);
        } catch (e) {
          await this.handleNetworkError(e);
        }
      } else {
        this.adapter.log.warn("Wrong state type. Only boolean accepted for switch.");
      }
    }
  }
}
class SoapMotionDetector extends SoapDevice {
  /**
   * Do polling here.
   *
   * @returns void
   */
  async onInterval() {
    await super.onInterval();
    if (this.ready) {
      try {
        const lastDetection = await this.withRelogin(() => this.client.lastDetection());
        const notChanged = await new Promise(
          (resolve, reject) => this.adapter.setStateChanged(
            this.id + import_suffixes.Suffixes.lastDetected,
            lastDetection,
            true,
            (err, _id, notChanged2) => err ? reject(err) : resolve(notChanged2 || false)
          )
        );
        if (!notChanged) {
          await this.adapter.setState(this.id + import_suffixes.Suffixes.state, true, true);
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
  /**
   * Creates objects for the device.
   */
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
    await this.adapter.setObjectNotExistsAsync(this.id + import_suffixes.Suffixes.sensitivity, {
      type: "state",
      common: {
        name: "sensitivity",
        type: "number",
        role: "level",
        min: 0,
        max: 100,
        read: true,
        write: true
      },
      native: {}
    });
    await this.adapter.setObjectNotExistsAsync(this.id + import_suffixes.Suffixes.backoff, {
      type: "state",
      common: {
        name: "time without new detection after a detection",
        type: "number",
        role: "level",
        unit: "s",
        min: 1,
        read: true,
        write: true
      },
      native: {}
    });
    await this.adapter.setObjectNotExistsAsync(this.id + import_suffixes.Suffixes.detectionEnabled, {
      type: "state",
      common: {
        name: "motion detection enabled",
        type: "boolean",
        role: "switch.enable",
        read: true,
        write: true
      },
      native: {}
    });
    for (const suffix of [import_suffixes.Suffixes.sensitivity, import_suffixes.Suffixes.backoff, import_suffixes.Suffixes.detectionEnabled]) {
      await this.adapter.subscribeStatesAsync(this.id + suffix);
    }
  }
  /**
   * Identify the device and read settings of the detector.
   *
   * @returns true if identification successful
   */
  async identify() {
    const result = await super.identify();
    await this.readDetectorSettings();
    return result;
  }
  /**
   * Reads the settings of the detector into the states.
   */
  async readDetectorSettings() {
    try {
      const settings = await this.withRelogin(() => this.client.getMotionDetectorSettings());
      await this.adapter.setState(this.id + import_suffixes.Suffixes.sensitivity, settings.Sensitivity, true);
      await this.adapter.setState(this.id + import_suffixes.Suffixes.backoff, settings.Backoff, true);
      await this.adapter.setState(this.id + import_suffixes.Suffixes.detectionEnabled, settings.OPStatus, true);
    } catch (e) {
      this.adapter.log.warn(`${this.name}: could not read settings of motion detector: ${e.message}`);
    }
  }
  /**
   * Writes changed settings of the detector.
   *
   * @param id id of state
   * @param state new state
   */
  async handleStateChange(id, state) {
    await super.handleStateChange(id, state);
    const isSensitivity = id.endsWith(import_suffixes.Suffixes.sensitivity);
    const isBackoff = id.endsWith(import_suffixes.Suffixes.backoff);
    const isEnabled = id.endsWith(import_suffixes.Suffixes.detectionEnabled);
    if (!isSensitivity && !isBackoff && !isEnabled) {
      return;
    }
    const value = isEnabled ? Boolean(state.val) : Math.round(Number(state.val));
    if (!isEnabled && (!Number.isFinite(value) || value < (isBackoff ? 1 : 0))) {
      this.adapter.log.warn(`${this.name}: invalid value ${state.val} for ${id}.`);
    } else {
      try {
        const settings = await this.withRelogin(() => this.client.getMotionDetectorSettings());
        if (isSensitivity) {
          settings.Sensitivity = Math.min(value, 100);
        } else if (isBackoff) {
          settings.Backoff = value;
        } else {
          settings.OPStatus = value;
        }
        if (!await this.client.setMotionDetectorSettings(settings)) {
          this.adapter.log.warn(`${this.name}: device did not accept ${state.val} for ${id}.`);
        }
      } catch (e) {
        this.adapter.log.warn(`${this.name}: could not change settings of motion detector: ${e.message}`);
      }
    }
    await this.readDetectorSettings();
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  SoapDevice,
  SoapMotionDetector,
  SoapSwitch
});
//# sourceMappingURL=soapDevice.js.map
