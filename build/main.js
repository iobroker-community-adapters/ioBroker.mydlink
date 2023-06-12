"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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
var utils = __toESM(require("@iobroker/adapter-core"));
var import_DeviceInfo = require("./lib/DeviceInfo");
var import_autoDetect = require("./lib/autoDetect");
var import_DeviceFactory = require("./lib/DeviceFactory");
class Mydlink extends utils.Adapter {
  constructor(options = {}) {
    super({
      ...options,
      name: "mydlink"
    });
    this.devices = [];
    this.unidentifiedDevices = [];
    this.autoDetector = void 0;
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("message", this.onMessage.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  async deleteDeviceFull(device) {
    device.stop();
    if (this.autoDetector) {
      for (const ip of Object.keys(this.autoDetector.detectedDevices)) {
        const dectDevice = this.autoDetector.detectedDevices[ip];
        if (dectDevice.mac === device.id) {
          dectDevice.alreadyPresent = false;
        }
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
    await this.delObjectAsync("info", { recursive: true });
    this.autoDetector = new import_autoDetect.AutoDetector(this);
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
      const device = await (0, import_DeviceFactory.createFromObject)(this, existingDevice);
      await device.createDeviceObject();
      if (existingDevice.native.pinNotEncrypted) {
        needUpdateConfig = true;
      }
      if (found) {
        await device.start();
        this.devices.push(device);
      } else {
        this.log.debug("Deleting " + device.name);
        await this.deleteDeviceFull(device);
      }
    }
    for (const configDevice of configDevicesToAdd) {
      const device = await (0, import_DeviceFactory.createFromTable)(this, configDevice, !configDevice.pinNotEncrypted);
      this.log.debug("Device " + device.name + " in config but not in devices -> create and add.");
      const oldDevice = this.devices.find((d) => d.mac === device.mac);
      if (oldDevice) {
        this.log.info("Duplicate entry for " + device.mac + " in config. Trying to rectify. Restart will happen. Affected devices: " + device.name + " === " + configDevice.name);
        needUpdateConfig = true;
      } else {
        await device.createDeviceObject();
        await device.start();
        await device.createDeviceObject();
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
  async onMessage(obj) {
    if (typeof obj === "object" && obj.message) {
      switch (obj.command) {
        case "discovery": {
          if (obj.callback) {
            const devices = [];
            if (this.autoDetector) {
              for (const key of Object.keys(this.autoDetector.detectedDevices)) {
                const device = this.autoDetector.detectedDevices[key];
                device.readOnly = true;
                devices.push(device);
              }
            }
            this.sendTo(obj.from, obj.command, devices, obj.callback);
          }
          break;
        }
        case "getDevices": {
          const tableDevices = [];
          for (const device of this.devices) {
            const tableDevice = {
              name: device.name,
              mac: device.mac,
              ip: device.ip,
              pin: device.pinDecrypted,
              pollInterval: device.pollInterval,
              enabled: device.enabled
            };
            tableDevices.push(tableDevice);
          }
          if (obj.callback) {
            this.sendTo(obj.from, obj.command, tableDevices, obj.callback);
          }
          break;
        }
        case "identifyDevice": {
          const params = obj.message;
          if (params && params.ip && params.pin) {
            let device = await (0, import_DeviceFactory.createFromTable)(this, {
              ip: params.ip,
              pin: params.pin
            }, false);
            try {
              await device.start();
              if (device.loggedIn && device.identified) {
                const oldDevice = this.devices.find((d) => d.mac === device.mac);
                if (oldDevice) {
                  device.stop();
                  device = oldDevice;
                } else {
                  this.devices.push(device);
                }
                const sendDevice = {
                  mac: device.mac,
                  name: device.name,
                  ip: device.ip,
                  pollInterval: device.pollInterval,
                  pin: device.pinDecrypted,
                  enabled: device.loggedIn && device.identified
                };
                if (obj.callback) {
                  this.sendTo(obj.from, obj.command, sendDevice, obj.callback);
                }
              } else {
                this.log.info("could not login -> error.");
                this.sendTo(obj.from, obj.command, "ERROR", obj.callback);
              }
            } catch (e) {
              this.log.info("could not login device: " + e.stack);
              if (obj.callback) {
                this.sendTo(obj.from, obj.command, "ERROR", obj.callback);
              }
            }
          }
          break;
        }
        default: {
          this.log.debug("Unknown command " + obj.command);
          break;
        }
      }
    }
  }
}
if (require.main !== module) {
  module.exports = (options) => new Mydlink(options);
} else {
  (() => new Mydlink())();
}
//# sourceMappingURL=main.js.map
