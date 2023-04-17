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
  WrongMacError: () => WrongMacError,
  WrongModelError: () => WrongModelError,
  processNetworkError: () => processNetworkError
});
module.exports = __toCommonJS(Device_exports);
var import_DeviceInfo = require("./DeviceInfo");
var import_suffixes = require("./suffixes");
var import_KnownDevices = require("./KnownDevices");
var import_soapDevice = require("./soapDevice");
var import_WebSocketDevice = require("./WebSocketDevice");
class WrongMacError extends Error {
  constructor(message) {
    super(message);
    this.name = "WRONGMAC";
  }
}
class WrongModelError extends Error {
  constructor(message) {
    super(message);
    this.name = "WRONGMODEL";
  }
}
function processNetworkError(e) {
  if (e.response) {
    return e.response.status;
  } else if (e.request) {
    return e.code;
  } else {
    return e.code;
  }
}
function deviceObjetToTableDevice(configDevice) {
  return {
    name: configDevice.native.name,
    mac: configDevice.native.mac,
    ip: configDevice.native.ip,
    pin: configDevice.native.pin,
    pollInterval: configDevice.native.pollInterval,
    enabled: configDevice.native.enabled
  };
}
class Device extends import_DeviceInfo.DeviceInfo {
  constructor(adapter, ip, pin, pinEncrypted) {
    super(ip, pin, pinEncrypted);
    this.adapter = adapter;
  }
  static async createFromObject(adapter, configDevice) {
    const native = configDevice.native;
    const pinEncrypted = native.mac && !native.pinNotEncrypted;
    if (native.model) {
      return Device.createDevice(adapter, {
        ip: native.ip,
        pin: native.pin,
        pinEncrypted,
        model: native.model,
        mac: native.mac,
        name: native.name,
        enabled: native.enabled,
        isWebsocket: native.useWebsocket
      });
    } else {
      adapter.log.info(`Model still unknown for ${native.name}. Trying to identify.`);
      return Device.createFromTable(adapter, deviceObjetToTableDevice(configDevice), pinEncrypted, native.useWebsocket);
    }
  }
  static async createDevice(adapter, params) {
    let device;
    const deviceFlags = import_KnownDevices.KnownDevices[params.model];
    if (deviceFlags) {
      device = new deviceFlags.DeviceType(adapter, params.ip, params.pin, params.pinEncrypted);
    } else {
      adapter.log.info(`Unknown device type ${params.model} for ${params.name}. Trying to identify.`);
      if (params.isWebsocket) {
        device = new import_WebSocketDevice.WebSocketDevice(adapter, params.ip, params.pin, params.pinEncrypted);
      } else {
        device = new import_soapDevice.SoapDevice(adapter, params.ip, params.pin, params.pinEncrypted);
      }
    }
    device.pollInterval = device.pollInterval || params.pollInterval;
    device.mac = device.mac || params.mac;
    device.id = device.id || params.id;
    device.name = device.name || params.name;
    device.model = params.model;
    device.enabled = device.enabled || params.enabled;
    device.isWebsocket = device.isWebsocket || params.isWebsocket;
    return device;
  }
  static async createFromTable(adapter, tableDevice, doDecrypt = false, forceWebsocket = false) {
    const pinEncrypted = doDecrypt && Boolean(tableDevice.mac);
    const mac = tableDevice.mac ? tableDevice.mac.toUpperCase() : "";
    let device;
    if (!forceWebsocket) {
      device = new import_soapDevice.SoapDevice(adapter, tableDevice.ip, tableDevice.pin, pinEncrypted);
    } else {
      device = new import_WebSocketDevice.WebSocketDevice(adapter, tableDevice.ip, tableDevice.pin, pinEncrypted);
    }
    device.mac = mac;
    device.pollInterval = tableDevice.pollInterval !== void 0 && isFinite(Number(tableDevice.pollInterval)) && tableDevice.pollInterval >= 0 ? Number(tableDevice.pollInterval) : 3e4;
    if (device.mac) {
      device.idFromMac();
    }
    device.name = tableDevice.name || device.name;
    device.enabled = tableDevice.enabled !== void 0 ? tableDevice.enabled : device.enabled;
    try {
      await device.login();
      if (device.loggedIn) {
        await device.identify();
      } else {
        throw new Error("Device not logged in... why?");
      }
    } catch (e) {
      device.stop();
      const code = processNetworkError(e);
      if (!forceWebsocket && (code === 500 || code === "ECONNREFUSED")) {
        return Device.createFromTable(adapter, tableDevice, doDecrypt, true);
      }
      if (e.name === WrongModelError.name) {
        adapter.log.debug(`Found ${device.model} for ${device.name}. Create a fitting device.`);
        return Device.createDevice(adapter, {
          model: device.model,
          ip: device.ip,
          pinEncrypted: false,
          pin: device.pinDecrypted,
          name: device.name,
          mac: device.mac,
          pollInterval: device.pollInterval,
          id: device.id,
          isWebsocket: device.isWebsocket,
          enabled: device.enabled
        });
      }
      if (e.name === WrongMacError.name) {
        adapter.log.info(`Device with unexpected MAC ${device.mac} reacted on ${device.ip}. Trying to create new device object for it.`);
        if (device.model) {
          return Device.createDevice(adapter, {
            model: device.model,
            ip: device.ip,
            pinEncrypted: false,
            pin: device.pinDecrypted,
            name: device.name,
            mac: device.mac,
            pollInterval: device.pollInterval,
            id: device.id,
            isWebsocket: device.isWebsocket,
            enabled: device.enabled
          });
        } else {
          return Device.createFromTable(adapter, {
            mac: device.mac,
            ip: device.ip,
            pin: device.pinDecrypted,
            name: device.name,
            pollInterval: device.pollInterval,
            enabled: device.enabled
          });
        }
      }
      adapter.log.debug("Login error: " + e.stack);
      if (!device.loginErrorPrinted && e.code !== "ETIMEDOUT" && e.code !== "ECONNABORTED" && e.code !== "ECONNRESET") {
        adapter.log.error(tableDevice.name + " could not login. Please check credentials and if device is online/connected. Error: " + e.code + " - " + e.stack);
        device.loginErrorPrinted = true;
      }
      device.loggedIn = false;
    }
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
        name: this.name,
        statusStates: {
          onlineId: `${this.adapter.namespace}.${this.id}.${import_suffixes.Suffixes.reachable}`
        }
      },
      native: {
        ip: this.ip,
        mac: this.mac,
        pin: this.pinEncrypted,
        pollInterval: this.pollInterval,
        enabled: this.enabled,
        name: this.name,
        model: this.model,
        useWebSocket: this.isWebsocket,
        pinNotEncrypted: false
      }
    });
  }
  async createObjects() {
    await this.adapter.setObjectNotExistsAsync(this.id + import_suffixes.Suffixes.enabled, {
      type: "state",
      common: {
        name: "enabled",
        type: "boolean",
        role: "indicator",
        read: true,
        write: false
      },
      native: {}
    });
    await this.adapter.setObjectNotExistsAsync(this.id + import_suffixes.Suffixes.unreachable, {
      type: "state",
      common: {
        name: "unreach",
        type: "boolean",
        role: "indicator.maintenance.unreach",
        read: true,
        write: false
      },
      native: {}
    });
    await this.adapter.setObjectNotExistsAsync(this.id + import_suffixes.Suffixes.reachable, {
      type: "state",
      common: {
        name: "device is reachable",
        type: "boolean",
        role: "indicator.reachable",
        read: true,
        write: false
      },
      native: {}
    });
  }
  stop() {
    if (this.intervalHandle) {
      this.adapter.clearTimeout(this.intervalHandle);
    }
    if (this.client && typeof this.client.disconnect === "function") {
      this.client.disconnect();
    }
    this.ready = false;
    this.loggedIn = false;
  }
  async login() {
    try {
      const loginResult = await this.client.login();
      if (loginResult === true) {
        this.adapter.log.debug(`${this.name} successfully logged in: ${loginResult}`);
        this.loggedIn = true;
        this.loginErrorPrinted = false;
      } else {
        if (!this.loginErrorPrinted) {
          this.loginErrorPrinted = true;
          this.loggedIn = false;
          this.adapter.log.debug("Login error: device returned " + loginResult + " - this should not really happen.");
          this.adapter.log.error(this.name + " could not login. Please check credentials and if device is online/connected.");
        }
      }
    } catch (e) {
      this.adapter.log.debug("Login error: " + e.stack);
      if (!this.loginErrorPrinted && e.code !== "ETIMEDOUT" && e.code !== "ECONNABORTED" && e.code !== "ECONNRESET") {
        this.adapter.log.error(this.name + " could not login. Please check credentials and if device is online/connected. Error: " + e.code + " - " + e.stack);
        this.loginErrorPrinted = true;
      }
      this.loggedIn = false;
      if (!this.pollInterval) {
        if (this.intervalHandle) {
          this.adapter.clearTimeout(this.intervalHandle);
        }
        this.intervalHandle = this.adapter.setTimeout(() => this.start(), 1e4);
      }
    }
    return this.loggedIn;
  }
  async sendModelInfoToSentry(xmls) {
    if (!import_KnownDevices.KnownDevices[this.model]) {
      this.adapter.log.info("Found new device, please report the following (full log from file, please) to developer: " + JSON.stringify(xmls, null, 2));
      if (this.adapter.supportsFeature && this.adapter.supportsFeature("PLUGINS")) {
        const sentryInstance = this.adapter.getPluginInstance("sentry");
        if (sentryInstance) {
          const Sentry = sentryInstance.getSentryObject();
          if (Sentry) {
            Sentry.withScope((scope) => {
              scope.setLevel("info");
              for (const key of Object.keys(xmls)) {
                scope.setExtra(key, xmls[key]);
              }
              Sentry.captureMessage("Unknown-Device " + this.model, "info");
            });
          }
        }
      }
    }
  }
  async identify() {
    if (!this.name) {
      this.name = this.model;
    }
    await this.createObjects();
    this.identified = true;
    return this.identified;
  }
  async handleNetworkError(e) {
    const code = processNetworkError(e);
    if (code === 403 || this.ready) {
      this.loggedIn = false;
    }
    this.adapter.log.debug("Error during communication " + this.name + ": " + code + " - " + e.stack + " - " + e.body);
    this.ready = false;
    await this.adapter.setStateChangedAsync(this.id + import_suffixes.Suffixes.unreachable, true, true);
    await this.adapter.setStateChangedAsync(this.id + import_suffixes.Suffixes.reachable, false, true);
    let connected = false;
    this.adapter.devices.forEach((device) => {
      connected = connected || device.ready;
    });
    await this.adapter.setStateChangedAsync("info.connection", connected, true);
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
        this.ready = await this.client.isDeviceReady();
        await this.adapter.setStateChangedAsync(this.id + import_suffixes.Suffixes.unreachable, !this.ready, true);
        await this.adapter.setStateAsync(this.id + import_suffixes.Suffixes.reachable, this.ready, true);
        if (this.ready) {
          await this.adapter.setStateChangedAsync("info.connection", true, true);
        }
      }
    } catch (e) {
      await this.handleNetworkError(e);
    }
    if (this.pollInterval > 0) {
      this.intervalHandle = this.adapter.setTimeout(
        () => this.onInterval,
        this.pollInterval
      );
    }
  }
  async start() {
    this.stop();
    if (this.enabled) {
      await this.login();
      if (this.loggedIn) {
        try {
          await this.identify();
          this.ready = await this.client.isDeviceReady();
          await this.adapter.setStateAsync(this.id + import_suffixes.Suffixes.reachable, this.ready, true);
          await this.adapter.setStateAsync(this.id + import_suffixes.Suffixes.unreachable, !this.ready, true);
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
        this.intervalHandle = this.adapter.setTimeout(
          () => this.onInterval,
          this.pollInterval
        );
      } else {
        this.pollInterval = 0;
        this.adapter.log.debug("Polling of " + this.name + " disabled, interval was " + interval + " (0 means disabled)");
      }
    }
    return result;
  }
  async handleStateChange(_id, _state) {
    if (this.loggedIn) {
      await this.login();
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Device,
  WrongMacError,
  WrongModelError,
  processNetworkError
});
//# sourceMappingURL=Device.js.map
