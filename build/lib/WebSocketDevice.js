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
var WebSocketDevice_exports = {};
__export(WebSocketDevice_exports, {
  WebSocketDevice: () => WebSocketDevice
});
module.exports = __toCommonJS(WebSocketDevice_exports);
var import_dlink_websocketclient = require("dlink_websocketclient");
var import_Device = require("./Device");
var import_suffixes = require("./suffixes");
class WebSocketDevice extends import_Device.Device {
  constructor(adapter, ip, pin, pinEncrypted) {
    super(adapter, ip, pin, pinEncrypted);
    this.numSockets = 1;
    this.isWebsocket = true;
    this.client = new import_dlink_websocketclient.WebSocketClient({
      ip: this.ip,
      pin: this.pinDecrypted,
      keepAlive: 5,
      useTelnetForToken: this.pinDecrypted.toUpperCase() === "TELNET",
      log: console.debug
    });
  }
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
    }
  }
  async onInterval() {
    await super.onInterval();
    if (this.ready) {
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
    }
  }
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
      clearTimeout(this.intervalHandle);
    }
    this.intervalHandle = setTimeout(() => {
      this.start();
    }, 1e4);
  }
  async start() {
    const result = super.start();
    this.client.on("switched", (val, socket) => {
      this.adapter.log.debug(`Event from device ${socket} now ${val}`);
      if (this.numSockets > 1) {
        this.adapter.setStateAsync(this.id + import_suffixes.Suffixes.state + "_" + (socket + 1), val, true);
      } else {
        this.adapter.setStateAsync(this.id + import_suffixes.Suffixes.state, val, true);
      }
    });
    this.client.on("error", (code, error) => this.onError(code, error));
    this.client.on("close", () => this.onError());
    this.client.on("message", (message) => this.adapter.log.debug(`${this.name} got message: ${message}`));
    await this.adapter.setStateAsync(this.id + import_suffixes.Suffixes.unreachable, false, true);
    this.ready = true;
    this.adapter.log.debug("Setup device event listener.");
    return result;
  }
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
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  WebSocketDevice
});
//# sourceMappingURL=WebSocketDevice.js.map
