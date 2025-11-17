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
class WrongMacError extends Error {
  static errorName = "WRONGMAC";
  name = "WRONGMAC";
  /**
   * Creates an instance of WrongMacError.
   *
   * @param message Error message
   */
  constructor(message) {
    super(message);
  }
}
class WrongModelError extends Error {
  static errorName = "WRONGMODEL";
  name = "WRONGMODEL";
  /**
   * Creates an instance of WrongModelError.
   *
   * @param message Error message
   */
  constructor(message) {
    super(message);
  }
}
function processNetworkError(e) {
  if (e.response) {
    return e.response.status;
  } else if (e.request) {
    return e.code;
  }
  return e.code;
}
class Device extends import_DeviceInfo.DeviceInfo {
  adapter;
  constructor(adapter, ip, pin, pinEncrypted) {
    super(ip, pin, pinEncrypted);
    this.adapter = adapter;
  }
  /**
   * Stores device configuration as Device Object in ioBroker Database.
   */
  async createDeviceObject() {
    if (!this.id) {
      if (!this.mac) {
        this.adapter.log.warn(
          `Could not create device ${this.name} without MAC. Please check config or if device is online.`
        );
        return;
      }
    }
    await this.adapter.extendObject(this.id, {
      type: "device",
      common: {
        name: this.name,
        statusStates: {
          onlineId: `${this.adapter.namespace}.${this.id}${import_suffixes.Suffixes.reachable}`
        }
      },
      native: {
        ip: this.ip,
        mac: this.mac,
        pin: this.pinEncrypted,
        pollInterval: Number(this.pollInterval),
        enabled: this.enabled,
        name: this.name,
        model: this.model,
        useWebSocket: this.isWebsocket,
        pinNotEncrypted: false
      }
    });
  }
  /**
   * Creates state-objects for the device.
   */
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
  /**
   * Stops communication with device.
   */
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
  /**
   * Starts log in for device. Needs to be done before additional commands can work.
   */
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
          this.adapter.log.debug(
            `Login error: device returned ${loginResult} - this should not really happen.`
          );
          this.adapter.log.error(
            `${this.name} could not login. Please check credentials and if device is online/connected.`
          );
        }
      }
    } catch (e) {
      this.adapter.log.debug(`Login error: ${e.stack}`);
      if (!this.loginErrorPrinted && e.code !== "ETIMEDOUT" && e.code !== "ECONNABORTED" && e.code !== "ECONNRESET" && this.model) {
        this.adapter.log.error(
          `${this.name} could not login. Please check credentials and if device is online/connected. Error: ${e.code} - ${e.stack}`
        );
        this.loginErrorPrinted = true;
      }
      this.loggedIn = false;
      if (!this.pollInterval && this.model) {
        if (this.intervalHandle) {
          this.adapter.clearTimeout(this.intervalHandle);
        }
        this.intervalHandle = this.adapter.setTimeout(() => this.start(), 1e4);
      }
    }
    return this.loggedIn;
  }
  /**
   * Identification of device needs to happen after successful login.
   * Problem: Maybe needs to create new object of new type. Hm...
   */
  async identify() {
    if (!this.name) {
      this.name = this.model;
    }
    await this.createObjects();
    this.identified = true;
    return this.identified;
  }
  /**
   * Handle network error during communication.
   *
   * @param e error object
   * @returns code as number or string
   */
  async handleNetworkError(e) {
    const code = processNetworkError(e);
    if ([403, 424].includes(code) || this.ready) {
      this.loggedIn = false;
    }
    this.adapter.log.debug(`Error during communication ${this.name}: ${code} - ${e.stack} - ${e.body}`);
    this.ready = false;
    if (this.id) {
      await this.adapter.setStateChangedAsync(this.id + import_suffixes.Suffixes.unreachable, true, true);
      await this.adapter.setStateChangedAsync(this.id + import_suffixes.Suffixes.reachable, false, true);
    }
    return code;
  }
  /**
   * Do polling here.
   *
   * @returns void
   */
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
        await this.adapter.setState(this.id + import_suffixes.Suffixes.reachable, this.ready, true);
      }
    } catch (e) {
      await this.handleNetworkError(e);
    }
    if (this.pollInterval > 0) {
      this.intervalHandle = this.adapter.setTimeout(() => this.onInterval(), this.pollInterval);
    }
  }
  /**
   * starting communication with device from config.
   *
   * @returns void
   */
  async start() {
    if (this.ready) {
      this.stop();
    }
    if (this.enabled) {
      await this.login();
      if (this.loggedIn) {
        try {
          await this.identify();
          this.ready = await this.client.isDeviceReady();
          await this.adapter.setState(this.id + import_suffixes.Suffixes.reachable, this.ready, true);
          await this.adapter.setState(this.id + import_suffixes.Suffixes.unreachable, !this.ready, true);
        } catch (e) {
          this.adapter.log.error(`${this.name} could not identify device: ${e.stack}`);
        }
      }
    }
    await this.adapter.setState(this.id + import_suffixes.Suffixes.enabled, { val: this.enabled, ack: true });
    if (this.enabled) {
      let interval = this.pollInterval;
      if (interval !== void 0 && !Number.isNaN(interval) && interval > 0) {
        if (interval < 500) {
          this.adapter.log.warn("Increasing poll rate to twice per second. Please check device config.");
          interval = 500;
        }
        if (interval >= 2147483647) {
          interval = 2147483646;
          this.adapter.log.warn("Poll rate was too high, reduced to prevent issues.");
        }
        this.adapter.log.debug(`Start polling for ${this.name} with interval ${interval}`);
        this.pollInterval = interval;
        this.intervalHandle = this.adapter.setTimeout(() => this.onInterval(), this.pollInterval);
      } else {
        this.pollInterval = 0;
        this.adapter.log.debug(`Polling of ${this.name} disabled, interval was ${interval} (0 means disabled)`);
      }
    }
  }
  /**
   * process a state change.
   *
   * @param _id of state
   * @param _state new state
   */
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
