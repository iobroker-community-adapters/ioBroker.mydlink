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
var WebSocketDevice_exports = {};
__export(WebSocketDevice_exports, {
  WebSocketDevice: () => WebSocketDevice
});
module.exports = __toCommonJS(WebSocketDevice_exports);
var import_Device = require("./Device");
var import_suffixes = require("./suffixes");
var import_axios = __toESM(require("axios"));
var import_dlink_websocketclient = __toESM(require("dlink_websocketclient"));
class WebSocketDevice extends import_Device.Device {
  constructor(adapter, ip, pin, pinEncrypted) {
    var _a;
    super(adapter, ip, pin, pinEncrypted);
    this.numSockets = 1;
    this.isWebsocket = true;
    this.client = new import_dlink_websocketclient.default({
      ip: this.ip,
      pin: this.pinDecrypted,
      keepAlive: 5,
      useTelnetForToken: ((_a = this.pinDecrypted) == null ? void 0 : _a.toUpperCase()) === "TELNET",
      log: console.debug
    });
  }
  /**
   * Creates objects for the device.
   */
  async createObjects() {
    await super.createObjects();
    if (this.numSockets > 1) {
      for (let index = 1; index <= this.numSockets; index += 1) {
        const id = this.id + import_suffixes.Suffixes.state + "_" + index;
        await this.adapter.setObjectNotExistsAsync(id, {
          type: "state",
          common: {
            name: "Socket " + index,
            type: "boolean",
            role: "switch",
            read: true,
            write: true
          },
          native: { index }
        });
        await this.adapter.subscribeStatesAsync(id);
      }
    } else {
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
    }
  }
  stop() {
    super.stop();
    if (this.client && typeof this.client.removeAllListeners === "function") {
      this.client.removeAllListeners("switch");
      this.client.removeAllListeners("error");
      this.client.removeAllListeners("close");
      this.client.removeAllListeners("message");
    }
  }
  /**
   * Do polling here.
   * @returns {Promise<void>}
   */
  async onInterval() {
    await super.onInterval();
    if (this.ready) {
      try {
        if (this.numSockets > 1) {
          const states = await this.client.state(-1);
          for (let index = 1; index <= this.numSockets; index += 1) {
            const id = this.id + import_suffixes.Suffixes.state + "_" + index;
            const val = states[index - 1];
            await this.adapter.setStateChangedAsync(id, val, true);
          }
        } else {
          const val = await this.client.state(0);
          await this.adapter.setStateChangedAsync(this.id + import_suffixes.Suffixes.state, val, true);
        }
      } catch (e) {
        await this.handleNetworkError(e);
      }
    }
  }
  /**
   * Error handler for event base client.
   */
  async onError(code, err) {
    await this.adapter.setStateAsync(this.id + import_suffixes.Suffixes.unreachable, true, true);
    if (code || err) {
      this.adapter.log.debug(`${this.name}: Socket error: ${code} - ${err ? err.stack : err}`);
    } else {
      this.adapter.log.debug(this.name + ": Socket closed.");
    }
    this.stop();
    this.ready = false;
    if (this.intervalHandle) {
      this.adapter.clearTimeout(this.intervalHandle);
    }
    this.intervalHandle = this.adapter.setTimeout(() => {
      this.start();
    }, 1e4);
  }
  /**
   * starting communication with device from config.
   * @returns {Promise<boolean>}
   */
  async start() {
    await super.start();
    this.client.on("switched", async (val, socket) => {
      this.adapter.log.debug(`Event from device ${socket} now ${val}`);
      if (this.numSockets > 1) {
        await this.adapter.setStateAsync(this.id + import_suffixes.Suffixes.state + "_" + (socket + 1), val, true);
      } else {
        await this.adapter.setStateAsync(this.id + import_suffixes.Suffixes.state, val, true);
      }
    });
    this.client.on("error", (code, error) => this.onError(code, error));
    this.client.on("close", () => this.onError());
    this.client.on("message", (message) => this.adapter.log.debug(`${this.name} got message: ${message}`));
    await this.adapter.setStateAsync(this.id + import_suffixes.Suffixes.unreachable, false, true);
    this.ready = true;
    this.adapter.log.debug("Setup device event listener.");
  }
  /**
   * process a state change. Device will just try to switch plug. Children will have to overwrite this behaviour.
   * @param id
   * @param state
   */
  async handleStateChange(id, state) {
    if (typeof state.val === "boolean") {
      if (!this.loggedIn) {
        await this.login();
      }
      let socket = 0;
      if (this.numSockets > 1) {
        socket = Number(id.substring(id.lastIndexOf("_") + 1)) - 1;
      }
      try {
        const newVal = await this.client.switch(state.val, socket);
        this.adapter.log.debug(`Switched Socket ${socket} of ${this.name} ${state.val ? "on" : "off"}.`);
        await this.adapter.setStateAsync(id, newVal, true);
      } catch (e) {
        const code = (0, import_Device.processNetworkError)(e);
        if (code === 403) {
          this.loggedIn = false;
        }
        this.adapter.log.error("Error while switching device " + this.name + ": " + code + " - " + e.stack);
      }
    } else {
      this.adapter.log.warn("Wrong state type. Only boolean accepted for switch.");
    }
  }
  async getModelInfoForSentry() {
    const url = `http://${this.ip}/login?username=Admin&password=${this.pinDecrypted}`;
    const result = await import_axios.default.get(url);
    return result.data;
  }
  async identify() {
    const id = this.client.getDeviceId();
    const mac = id.match(/.{2}/g).join(":").toUpperCase();
    if (this.mac && this.mac !== mac) {
      throw new import_Device.WrongMacError(`${this.name} reported mac ${mac}, expected ${this.mac}, probably ip ${this.ip} wrong and talking to wrong device?`);
    }
    this.mac = mac;
    this.id = id;
    const url = `http://${this.ip}/login?username=Admin&password=${this.pinDecrypted}`;
    try {
      const result = await import_axios.default.get(url);
      if (result.status === 200) {
        const startPos = result.data.indexOf("SSID: ") + 6;
        const model = result.data.substring(startPos, startPos + 8);
        if (!model) {
          this.adapter.log.warn(`${this.name} identify responded with unknown result, please report: ${result.data}`);
        }
        this.adapter.log.debug("Got model " + model + " during identification of " + this.name);
        if (model !== this.model) {
          const oldModel = this.model;
          this.model = model;
          this.adapter.log.info("Model updated from " + (oldModel || "unknown") + " to " + model);
          throw new import_Device.WrongModelError(`${this.name} model changed from ${oldModel} to ${model}`);
        }
      } else {
        this.adapter.log.warn(`${this.name} could not be identified: ${result.data}`);
      }
    } catch (e) {
      const code = await this.handleNetworkError(e);
      console.log("Got code: " + code);
      if (code === "ECONNREFUSED") {
        this.adapter.log.debug("Failed to identify -> for now assume W118, because that one is nasty.");
        const model = "DSP-W118";
        if (model !== this.model) {
          const oldModel = this.model;
          this.model = model;
          this.adapter.log.info("Model updated from " + (oldModel || "unknown") + " to " + model);
          throw new import_Device.WrongModelError(`${this.name} model changed from ${oldModel} to ${model}`);
        }
      }
    }
    const superResult = await super.identify();
    if (this.numSockets > 1) {
      const states = await this.client.state(-1);
      for (let index = 1; index <= this.numSockets; index += 1) {
        await this.adapter.setStateChangedAsync(this.id + import_suffixes.Suffixes.state + "_" + index, states[index - 1], true);
      }
    } else {
      const state = await this.client.state();
      await this.adapter.setStateChangedAsync(this.id + import_suffixes.Suffixes.state, state, true);
    }
    return superResult;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  WebSocketDevice
});
//# sourceMappingURL=WebSocketDevice.js.map
