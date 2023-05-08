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
var autoDetect_exports = {};
__export(autoDetect_exports, {
  AutoDetector: () => AutoDetector
});
module.exports = __toCommonJS(autoDetect_exports);
var import_mdns_discovery = __toESM(require("mdns-discovery"));
var import_WebSocketDevice = require("./WebSocketDevice");
class AutoDetector {
  constructor(adapter) {
    this.detectedDevices = {};
    this.debug = false;
    this.adapter = adapter;
    this.mdns = new import_mdns_discovery.default({
      timeout: 0,
      name: ["_dhnap._tcp.local", "_dcp._tcp.local"],
      find: "*",
      broadcast: false
    });
    this.logDebug("Auto detection started");
    if (this.mdns !== void 0) {
      this.mdns.on("entry", this.onDetection.bind(this));
      this.mdns.run(() => adapter.log.info("Discovery done"));
    }
  }
  logDebug(message) {
    if (this.debug) {
      this.adapter.log.debug(message);
    }
  }
  async onDetection(entry) {
    function extractStringsFromBuffer(buffer) {
      let index = 0;
      const strings = [];
      while (index < buffer.length) {
        const length = buffer.readInt8(index);
        index += 1;
        strings.push(buffer.subarray(index, index + length).toString());
        index += length;
      }
      return strings;
    }
    if (entry.name !== "_dhnap._tcp.local" && entry.name !== "_dcp._tcp.local") {
      return;
    }
    if (entry.name === "_dcp._tcp.local") {
      this.logDebug("Maybe detected websocket device");
      console.log(entry);
      let model;
      if (entry.PTR && entry.PTR.data) {
        model = entry.PTR.data.substring(0, 8);
      }
      const newDevice = new import_WebSocketDevice.WebSocketDevice(this.adapter, entry.ip, "INVALID", false);
      newDevice.model = model;
      try {
        await newDevice.client.login();
        newDevice.id = newDevice.client.getDeviceId().toUpperCase();
        if (newDevice.id) {
          newDevice.mac = newDevice.id.match(/.{2}/g).join(":");
          this.logDebug(`Got websocket device ${model} on ${newDevice.ip}`);
        }
      } catch (e) {
        this.logDebug("Could not identify websocket device: " + e.stack);
      } finally {
        newDevice.stop();
      }
      const device = this.adapter.devices.find((device2) => device2.mac === entry.mac);
      if (device) {
        this.logDebug(`Device was already present as ${device.model} on ${device.ip}`);
        if (device.ip === newDevice.ip && device.model !== newDevice.model) {
          this.logDebug(`Model still differs? ${device.model} != ${newDevice.model}`);
          if (model && device.isWebsocket) {
            this.logDebug("Updated model to " + model);
            device.model = model;
            await device.createDeviceObject();
          }
        }
      } else {
        this.detectedDevices[entry.ip] = {
          ip: newDevice.ip,
          name: entry.name,
          type: model,
          mac: newDevice.mac,
          mydlink: true,
          useWebSocket: true,
          alreadyPresent: !!device
        };
      }
    }
    if (entry.TXT && entry.TXT.data) {
      let device = this.detectedDevices[entry.ip];
      if (!device) {
        device = {
          ip: entry.ip,
          name: entry.name
        };
      }
      const keyValuePairs = extractStringsFromBuffer(entry.TXT.data);
      for (const pair of keyValuePairs) {
        const [key, value] = pair.split("=");
        switch (key.toLowerCase()) {
          case "mac": {
            device.mac = value.toUpperCase();
            break;
          }
          case "model_number": {
            device.type = value;
            break;
          }
          case "mydlink": {
            if (value === "true") {
              device.mydlink = true;
            }
          }
        }
      }
      if (device.mydlink) {
        this.detectedDevices[device.ip] = device;
        const oldDevice = this.adapter.devices.find((d) => d.mac === device.mac);
        if (oldDevice) {
          if (oldDevice.model !== device.type) {
            oldDevice.model = device.type;
          }
          if (device.ip !== oldDevice.ip) {
            oldDevice.ip = device.ip;
            await oldDevice.createDeviceObject();
            await oldDevice.start();
          }
          device.alreadyPresent = true;
        }
        this.logDebug("Detected Device now is: " + JSON.stringify(device, null, 2));
      }
    }
  }
  close() {
    if (this.mdns && typeof this.mdns.close === "function") {
      this.mdns.close();
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AutoDetector
});
//# sourceMappingURL=autoDetect.js.map
