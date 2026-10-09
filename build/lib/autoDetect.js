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
var autoDetect_exports = {};
__export(autoDetect_exports, {
  AutoDetector: () => AutoDetector
});
module.exports = __toCommonJS(autoDetect_exports);
var import_multicast_dns = __toESM(require("multicast-dns"));
var import_soapDevice = require("./soapDevice");
var import_WebSocketDevice = require("./WebSocketDevice");
var import_TableDevice = require("./TableDevice");
const SOAP_SERVICE = "_dhnap._tcp.local";
const WEBSOCKET_SERVICE = "_dcp._tcp.local";
const MIN_QUERY_INTERVAL = 3e4;
class AutoDetector {
  mdns;
  adapter;
  detectedDevices = {};
  lastQuery = 0;
  /** MACs of devices whose new IP is currently being verified. */
  ipChecksInProgress = /* @__PURE__ */ new Set();
  /**
   * Send mDNS query for all D-Link services.
   */
  query() {
    this.lastQuery = Date.now();
    this.mdns.query({
      questions: [
        { name: SOAP_SERVICE, type: "PTR" },
        { name: WEBSOCKET_SERVICE, type: "PTR" }
      ]
    });
  }
  /**
   * Query again, if last query is some time ago. Used while admin dialog is open.
   */
  refresh() {
    if (Date.now() - this.lastQuery > MIN_QUERY_INTERVAL) {
      this.query();
    }
  }
  /**
   * Handle mDNS response packet. All records of one packet are evaluated together.
   *
   * @param packet the mDNS response
   * @param packet.answers answer records
   * @param packet.additionals additional records
   * @param rinfo information about the sender
   */
  async onResponse(packet, rinfo) {
    const records = [...packet.answers || [], ...packet.additionals || []];
    const ptr = records.find(
      (r) => r.type === "PTR" && (r.name === SOAP_SERVICE || r.name === WEBSOCKET_SERVICE)
    );
    if (!ptr) {
      return;
    }
    const txt = records.find((r) => r.type === "TXT");
    await this.onDetection({
      ip: rinfo.address,
      name: ptr.name,
      ptrData: ptr.data,
      txt: txt ? txtToStrings(txt.data) : void 0
    });
  }
  /**
   * Handle detection of a D-Link device.
   *
   * @param entry The detection entry.
   * @param entry.ip The IP address of the detected device.
   * @param entry.name The mDNS service name of the detected device.
   * @param entry.ptrData The service instance name from the PTR record.
   * @param entry.txt The key=value strings of the TXT record, if available.
   */
  async onDetection(entry) {
    const alreadyDetected = this.detectedDevices[entry.ip];
    if (entry.name === WEBSOCKET_SERVICE && !(alreadyDetected == null ? void 0 : alreadyDetected.mac)) {
      this.adapter.log.debug(`Maybe detected websocket device on ${entry.ip}`);
      const model = entry.ptrData ? entry.ptrData.substring(0, 8) : "";
      const newDevice = new import_WebSocketDevice.WebSocketDevice(this.adapter, entry.ip, "INVALID", false);
      newDevice.model = model;
      try {
        await newDevice.client.login();
        newDevice.id = newDevice.client.getDeviceId().toUpperCase();
        if (newDevice.id) {
          newDevice.mac = newDevice.id.match(/.{2}/g).join(":");
          this.adapter.log.debug(`Got websocket device ${model} on ${newDevice.ip}`);
        }
      } catch (e) {
        this.adapter.log.debug(`Could not identify websocket device: ${e.stack}`);
      } finally {
        newDevice.stop();
      }
      const device = newDevice.mac ? this.adapter.devices.find((d) => d.mac === newDevice.mac) : void 0;
      if (device) {
        this.adapter.log.debug(`Device was already present as ${device.model} on ${device.ip}`);
        if (device.ip === newDevice.ip && device.model !== newDevice.model) {
          this.adapter.log.debug(`Model still differs? ${device.model} != ${newDevice.model}`);
          if (model && device.isWebsocket) {
            this.adapter.log.debug(`Updated model to ${model}`);
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
          alreadyPresent: false
        };
      }
    }
    if (entry.txt) {
      const device = this.detectedDevices[entry.ip] || {
        ip: entry.ip,
        name: entry.name
      };
      if (entry.name === WEBSOCKET_SERVICE) {
        device.mydlink = true;
        device.useWebSocket = true;
      }
      for (const pair of entry.txt) {
        const [key, value] = pair.split("=");
        switch (key.toLowerCase()) {
          //extract mac:
          case "mac": {
            device.mac = (0, import_TableDevice.normalizeMac)(value);
            break;
          }
          //extract model number (websocket devices use 'model'):
          case "model":
          case "model_number": {
            device.type = value;
            break;
          }
          //if mydlink=true -> we should look at that device! :)
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
          if (device.type && oldDevice.model !== device.type) {
            oldDevice.model = device.type;
          }
          if (device.ip !== oldDevice.ip) {
            await this.checkIpChange(oldDevice, device.ip);
          }
          device.alreadyPresent = true;
        }
        this.adapter.log.debug(`Detected Device now is: ${JSON.stringify(device)}`);
      }
    }
  }
  /**
   * A known device was detected on another IP. Verify that and store new IP in config.
   * Only done if the device is not reachable on its configured IP, because some devices seem to answer for others.
   *
   * @param oldDevice the configured device
   * @param ip the IP the device was detected on
   */
  async checkIpChange(oldDevice, ip) {
    if (oldDevice.ready || this.ipChecksInProgress.has(oldDevice.mac)) {
      return;
    }
    this.ipChecksInProgress.add(oldDevice.mac);
    try {
      if (await this.verifyMac(oldDevice, ip)) {
        this.adapter.log.info(
          `${oldDevice.name} changed ip from ${oldDevice.ip} to ${ip}. Updating config, adapter will restart.`
        );
        await this.adapter.updateDeviceIp(oldDevice.mac, ip);
      } else {
        this.adapter.log.debug(`${oldDevice.name} announced on ${ip}, but could not verify MAC there.`);
      }
    } finally {
      this.ipChecksInProgress.delete(oldDevice.mac);
    }
  }
  /**
   * Log in on IP with credentials of a configured device and check if the MAC matches.
   *
   * @param oldDevice the configured device
   * @param ip the IP to check
   * @returns true if the device on ip has the MAC of oldDevice
   */
  async verifyMac(oldDevice, ip) {
    try {
      if (oldDevice.isWebsocket) {
        const device2 = new import_WebSocketDevice.WebSocketDevice(this.adapter, ip, oldDevice.pinDecrypted, false);
        try {
          await device2.client.login();
          return (0, import_TableDevice.normalizeMac)(device2.client.getDeviceId()) === oldDevice.mac;
        } finally {
          device2.stop();
        }
      }
      const device = new import_soapDevice.SoapDevice(this.adapter, ip, oldDevice.pinDecrypted, false);
      if (!await device.client.login()) {
        return false;
      }
      const settings = await device.client.getDeviceSettings();
      return (0, import_TableDevice.normalizeMac)(settings.DeviceMacId) === oldDevice.mac;
    } catch (e) {
      this.adapter.log.debug(`Could not verify MAC of ${oldDevice.name} on ${ip}: ${e.message}`);
      return false;
    }
  }
  /**
   * Close the mDNS listener.
   */
  close() {
    this.mdns.destroy();
  }
  /**
   * Constructor.
   *
   * @param adapter reference to the adapter
   */
  constructor(adapter) {
    this.adapter = adapter;
    this.mdns = (0, import_multicast_dns.default)();
    this.mdns.on("response", (packet, rinfo) => {
      this.onResponse(packet, rinfo).catch(
        (e) => this.adapter.log.debug(`Error during processing of mDNS response: ${e.stack}`)
      );
    });
    this.mdns.on("error", (e) => this.adapter.log.warn(`Auto detection error: ${e.message}`));
    this.mdns.on("warning", (e) => this.adapter.log.debug(`Auto detection warning: ${e.message}`));
    this.mdns.on("ready", () => {
      this.adapter.log.debug("Auto detection started");
      this.query();
    });
  }
}
function txtToStrings(data) {
  const items = Array.isArray(data) ? data : [data];
  return items.map((item) => Buffer.isBuffer(item) ? item.toString() : String(item));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AutoDetector
});
//# sourceMappingURL=autoDetect.js.map
