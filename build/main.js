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
var import_Device = require("./lib/Device");
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
  async deleteDeviceFull(device) {
    device.stop();
    for (const ip of Object.keys(this.detectedDevices)) {
      const dectDevice = this.detectedDevices[ip];
      if (dectDevice.mac === device.id) {
        dectDevice.alreadyPresent = false;
      }
    }
    try {
      const ids = await this.getObjectListAsync({
        startkey: this.namespace + "." + device.id,
        endkey: this.namespace + "." + device.id + "\u9999"
      });
      if (ids) {
        for (const obj of ids.rows) {
          await this.delObjectAsync(obj.value._id);
        }
      }
    } catch (e) {
      this.log.error("Error during deletion of " + device.id + ": " + e.stack);
    }
  }
  async onReady() {
    const systemConfig = await this.getForeignObjectAsync("system.config");
    if (systemConfig) {
      import_DeviceInfo.DeviceInfo.setSecret(systemConfig.native ? systemConfig.native.secret : "RJaeBLRPwvPfh5O");
    }
    this.setState("info.connection", false, true);
    this.autoDetector = new import_autoDetect.AutoDetector(this);
    let haveActiveDevices = false;
    const existingDevices = await this.getDevicesAsync();
    const configDevicesToAdd = [].concat(this.config.devices);
    this.log.debug("Got existing devices: " + JSON.stringify(existingDevices, null, 2));
    this.log.debug("Got config devices: " + JSON.stringify(configDevicesToAdd, null, 2));
    let needUpdateConfig = false;
    for (const existingDevice of existingDevices) {
      let found = false;
      for (const configDevice of this.config.devices) {
        needUpdateConfig = !configDevice.mac;
        if (configDevice.mac && configDevice.mac === existingDevice.native.mac || !configDevice.mac && configDevice.ip === existingDevice.native.ip) {
          found = true;
          for (const key of Object.keys(configDevice)) {
            existingDevice.native[key] = configDevice[key];
          }
          existingDevice.native.pinNotEncrypted = !configDevice.mac;
          configDevicesToAdd.splice(configDevicesToAdd.indexOf(configDevice), 1);
          break;
        }
      }
      const device = import_Device.Device.createFromObject(this, existingDevice);
      await device.createDeviceObject();
      if (existingDevice.native.pinNotEncrypted) {
        needUpdateConfig = true;
      }
      if (found) {
        haveActiveDevices = await device.start() || haveActiveDevices;
        this.devices.push(device);
      } else {
        this.log.debug("Deleting " + device.name);
        await this.deleteDeviceFull(device);
      }
    }
    for (const configDevice of configDevicesToAdd) {
      const device = import_Device.Device.createFromTable(this, configDevice, !configDevice.pinNotEncrypted);
      this.log.debug("Device " + device.name + " in config but not in devices -> create and add.");
      const oldDevice = this.devices.find((d) => d.mac === device.mac);
      if (oldDevice) {
        this.log.info("Duplicate entry for " + device.mac + " in config. Trying to rectify. Restart will happen. Affected devices: " + device.name + " === " + configDevice.name);
        needUpdateConfig = true;
      } else {
        await device.createDeviceObject();
        haveActiveDevices = await device.start() || haveActiveDevices;
        await device.createDeviceObject();
        ;
        this.devices.push(device);
      }
    }
    if (needUpdateConfig) {
      const devices = [];
      for (const device of this.devices) {
        const configDevice = {
          ip: device.ip,
          mac: device.mac,
          pin: device.pinEncrypted,
          pollInterval: device.pollInterval,
          enabled: device.enabled,
          name: device.name,
          model: device.model,
          useWebSocket: device.isWebsocket
        };
        devices.push(configDevice);
      }
      await this.extendForeignObjectAsync("system.adapter." + this.namespace, {
        native: {
          devices
        }
      });
    }
    await this.setStateChangedAsync("info.connection", !haveActiveDevices, true);
  }
  onUnload(callback) {
    try {
      this.log.debug("Stop polling");
      for (const device of this.devices) {
        device.stop();
      }
      if (this.autoDetector) {
        this.autoDetector.close();
      }
      this.log.info("cleaned everything up...");
      callback();
    } catch (e) {
      callback();
    }
  }
  async onStateChange(id, state) {
    if (state) {
      this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
      if (state.ack === false) {
        const deviceId = id.split(".")[2];
        const device = this.devices.find((d) => d.id === deviceId);
        if (device) {
          await device.handleStateChange(id, state);
        } else {
          this.log.info(`Unknown device ${deviceId} for ${id}. Can't control anything.`);
        }
      }
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
