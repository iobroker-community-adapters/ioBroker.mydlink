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
var Device_exports = {};
__export(Device_exports, {
  Device: () => Device,
  processNetworkError: () => processNetworkError
});
module.exports = __toCommonJS(Device_exports);
var import_DeviceInfo = require("./DeviceInfo");
var import_suffixes = require("./suffixes");
function processNetworkError(e) {
  if (e.response) {
    return e.response.status;
  } else if (e.request) {
    return e.code;
  } else {
    return e.code;
  }
}
class Device extends import_DeviceInfo.DeviceInfo {
  constructor(adapter, ip, pin, pinEncrypted) {
    super(ip, pin, pinEncrypted);
    this.adapter = adapter;
  }
  static createFromObject(adapter, configDevice) {
    const native = configDevice.native;
    const pinEncrypted = native.mac && !native.pinNotEncrypted;
    const device = new this(adapter, native.ip, native.pin, pinEncrypted);
    device.pollInterval = native.pollInterval;
    device.mac = native.mac ? native.mac.toUpperCase() : "";
    device.id = configDevice._id.split(".")[2];
    device.name = native.name;
    device.model = native.model || "";
    device.enabled = native.enabled;
    device.isWebsocket = native.useWebsocket;
    return device;
  }
  static createFromTable(adapter, tableDevice, doDecrypt = false) {
    const pinEncrypted = doDecrypt && Boolean(tableDevice.mac);
    const device = new this(adapter, tableDevice.ip, tableDevice.pin, pinEncrypted);
    device.pollInterval = tableDevice.pollInterval !== void 0 && isFinite(Number(tableDevice.pollInterval)) && tableDevice.pollInterval >= 0 ? Number(tableDevice.pollInterval) : 3e4;
    device.mac = tableDevice.mac ? tableDevice.mac.toUpperCase() : "";
    tableDevice.mac ? device.idFromMac() : "";
    device.name = tableDevice.name;
    device.enabled = tableDevice.enabled;
    return device;
  }
  async createDeviceObject() {
    if (!this.id) {
      if (!this.mac) {
        this.adapter.log.warn("Could not create device " + this.name + " without MAC. Please check config or if device is online.");
        return;
      }
    }
    await this.adapter.extendObjectAsync(this.id, {
      type: "device",
      common: {
        name: this.name
      },
      native: {
        ip: this.ip,
        mac: this.mac,
        pin: this.pinEncrypted,
        pollInterval: this.pollInterval,
        enabled: this.enabled,
        name: this.name,
        model: this.model,
        useWebSocket: this.isWebsocket
      }
    });
  }
  stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
    }
    if (this.client && typeof this.client.disconnect === "function") {
      this.client.disconnect();
    }
    this.ready = false;
    this.loggedIn = false;
  }
  async login() {
  }
  async identify() {
  }
  async onInterval() {
    try {
      if (!this.loggedIn) {
        await this.login();
      }
      if (this.loggedIn && !this.identified) {
        await this.identify();
      }
      if (this.loggedIn && this.identified) {
        this.ready = this.client.isDeviceReady();
        await this.adapter.setStateAsync(this.id + import_suffixes.Suffixes.unreachable, !this.ready, true);
        if (this.ready) {
          await this.adapter.setStateChangedAsync("info.connection", true, true);
        }
      }
    } catch (e) {
      const code = processNetworkError(e);
      if (code === 403 || this.ready) {
        this.loggedIn = false;
      }
      this.adapter.log.debug("Error during polling " + this.name + ": " + code + " - " + e.stack + " - " + e.body);
      this.ready = false;
      await this.adapter.setStateChangedAsync(this.id + import_suffixes.Suffixes.unreachable, true, true);
      let connected = false;
      this.adapter.devices.forEach((device) => {
        connected = connected || device.ready;
      });
      await this.adapter.setStateChangedAsync("info.connection", connected, true);
    }
    this.intervalHandle = setTimeout(
      () => this.onInterval,
      this.pollInterval
    );
  }
  async start() {
    this.stop();
    if (this.enabled) {
      await this.login();
      if (this.loggedIn) {
        try {
          await this.identify();
        } catch (e) {
          this.adapter.log.error(this.name + " could not get settings: " + e.stack);
        }
      }
    }
    await this.adapter.setStateAsync(this.id + import_suffixes.Suffixes.enabled, { val: this.enabled, ack: true });
    let result = false;
    if (this.enabled) {
      let interval = this.pollInterval;
      if (interval !== void 0 && !Number.isNaN(interval) && interval > 0) {
        this.adapter.log.debug("Start polling for " + this.name + " with interval " + interval);
        result = true;
        if (interval < 500) {
          this.adapter.log.warn("Increasing poll rate to twice per second. Please check device config.");
          interval = 500;
        }
        if (interval >= 2147483647) {
          interval = 2147483646;
          this.adapter.log.warn("Poll rate was too high, reduced to prevent issues.");
        }
        this.pollInterval = interval;
        this.intervalHandle = setTimeout(
          () => this.onInterval,
          this.pollInterval
        );
      } else {
        this.adapter.log.debug("Polling of " + this.name + " disabled, interval was " + interval + " (0 means disabled)");
      }
    }
    return result;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Device,
  processNetworkError
});
//# sourceMappingURL=Device.js.map
