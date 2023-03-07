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
var main_exports = {};
__export(main_exports, {
  Mydlink: () => Mydlink
});
module.exports = __toCommonJS(main_exports);
var utils = __toESM(require("@iobroker/adapter-core"));
var import_DeviceInfo = require("./lib/DeviceInfo");
var import_autoDetect = require("./lib/autoDetect");
class Mydlink extends utils.Adapter {
  constructor(options = {}) {
    super({
      ...options,
      name: "mydlink"
    });
    this.devices = [];
    this.detectedDevices = {};
    this.autoDetector = void 0;
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("message", this.onMessage.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  async onReady() {
    const systemConfig = await this.getForeignObjectAsync("system.config");
    if (systemConfig) {
      import_DeviceInfo.DeviceInfo.setSecret(systemConfig.native ? systemConfig.native.secret : "RJaeBLRPwvPfh5O");
    }
    this.setState("info.connection", false, true);
    this.autoDetector = new import_autoDetect.AutoDetector(this);
  }
  onUnload(callback) {
    try {
      callback();
    } catch (e) {
      callback();
    }
  }
  onStateChange(id, state) {
    if (state) {
      this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
    } else {
      this.log.info(`state ${id} deleted`);
    }
  }
  onMessage(obj) {
    if (typeof obj === "object" && obj.message) {
      if (obj.command === "send") {
        this.log.info("send command");
        if (obj.callback)
          this.sendTo(obj.from, obj.command, "Message received", obj.callback);
      }
    }
  }
}
if (require.main !== module) {
  module.exports = (options) => new Mydlink(options);
} else {
  (() => new Mydlink())();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Mydlink
});
//# sourceMappingURL=main.js.map
