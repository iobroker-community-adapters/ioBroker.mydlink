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
var DeviceManagement_exports = {};
__export(DeviceManagement_exports, {
  MydlinkDeviceManagement: () => MydlinkDeviceManagement
});
module.exports = __toCommonJS(DeviceManagement_exports);
var I18n = __toESM(require("@iobroker/adapter-core/i18n"));
var import_dm_utils = require("@iobroker/dm-utils");
var import_KnownDevices = require("./KnownDevices");
var import_suffixes = require("./suffixes");
var import_Config = require("./Config");
const SAVE_DELAY = 1e3;
const FULL_WIDTH = { xs: 12, sm: 12, md: 12, lg: 12, xl: 12 };
const TYPE_ICONS = {
  "Smart plug": "socket",
  "Motion detection": "motion",
  Sirene: "warning"
};
function t(key, ...args) {
  return I18n.getTranslatedObject(key, ...args);
}
function deviceKey(device) {
  return device.mac || device.ip;
}
class MydlinkDeviceManagement extends import_dm_utils.DeviceManagement {
  saveTimeout;
  /**
   * Returns information and actions of the instance.
   */
  getInstanceInfo() {
    return {
      apiVersion: "v3",
      identifierLabel: t("ipaddress"),
      actions: [
        {
          id: "search",
          icon: "search",
          title: t("dmSearchDevices"),
          description: t("dmSearchDevicesDescription"),
          handler: (context) => this.searchDevices(context)
        },
        {
          id: "add",
          icon: "add",
          title: t("dmAddDevice"),
          description: t("dmAddDeviceDescription"),
          handler: (context) => this.addDevice(context)
        }
      ]
    };
  }
  /**
   * Fills the device list of the GUI.
   *
   * @param context load context
   */
  loadDevices(context) {
    context.setTotalDevices(this.adapter.devices.length);
    for (const device of this.adapter.devices) {
      context.addDevice(this.getDmDeviceInfo(device));
    }
  }
  /**
   * Returns details of a device.
   *
   * @param id id of the device in the device manager
   */
  getDeviceDetails(id) {
    const device = this.findDevice(id);
    if (!device) {
      return { error: `Unknown device ${id}` };
    }
    const info = (label, data) => ({
      type: "staticInfo",
      label: t(label),
      data,
      booleanAsCheckbox: true,
      ...FULL_WIDTH
    });
    const schema = {
      type: "panel",
      items: {
        model: info("model", device.model),
        mac: info("mac", device.mac),
        ip: info("ipaddress", device.ip),
        protocol: info("dmProtocol", device.isWebsocket ? "WebSocket" : "HNAP"),
        pollInterval: info("pollInterval", device.pollInterval),
        loggedIn: info("dmLoggedIn", device.loggedIn),
        ready: info("dmReady", device.ready)
      }
    };
    return { id, schema };
  }
  /**
   * Creates the device manager information of a device.
   *
   * @param device the device
   * @returns device information for the GUI
   */
  getDmDeviceInfo(device) {
    var _a;
    const type = (_a = import_KnownDevices.KnownDevices[device.model]) == null ? void 0 : _a.type;
    return {
      id: deviceKey(device),
      identifier: device.ip,
      name: device.name || device.model || device.ip,
      icon: TYPE_ICONS[type],
      manufacturer: "D-Link",
      model: device.model,
      connectionType: "wifi",
      enabled: device.enabled,
      //disabled devices are not contacted, their reachable state is not current.
      status: device.id && device.enabled ? {
        connection: {
          stateId: `${this.adapter.namespace}.${device.id}${import_suffixes.Suffixes.reachable}`,
          mapping: { true: "connected", false: "disconnected" }
        }
      } : "disconnected",
      hasDetails: true,
      actions: [
        {
          id: "edit",
          icon: "edit",
          description: t("dmEditDevice"),
          handler: (id, context) => this.editDevice(id, context)
        },
        {
          id: import_dm_utils.ACTIONS.ENABLE_DISABLE,
          handler: (id) => this.toggleEnabled(id)
        },
        {
          id: "delete",
          icon: "delete",
          description: t("dmDeleteDevice"),
          confirmation: t("dmDeleteConfirm", device.name || device.ip),
          handler: (id) => this.deleteDevice(id)
        }
      ]
    };
  }
  /**
   * Finds a running device by its device manager id.
   *
   * @param id id of the device in the device manager
   * @returns the device or undefined
   */
  findDevice(id) {
    return this.adapter.devices.find((device) => deviceKey(device) === id);
  }
  /**
   * Stores the devices in the configuration after the answer was sent to the GUI. The adapter restarts then.
   * Several changes in a short time are stored together.
   */
  scheduleSave() {
    if (this.saveTimeout) {
      this.adapter.clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = this.adapter.setTimeout(() => {
      this.saveTimeout = void 0;
      this.adapter.log.info("Device configuration changed in device manager. Adapter will restart.");
      this.adapter.saveConfigDevices(this.adapter.devices.map(import_Config.deviceToTableDevice)).catch((e) => this.adapter.log.error(`Could not save configuration: ${e}`));
    }, SAVE_DELAY);
  }
  /**
   * Instance action: offers the detected devices, that are not configured, yet.
   *
   * @param context action context
   */
  async searchDevices(context) {
    const autoDetector = this.adapter.autoDetector;
    autoDetector == null ? void 0 : autoDetector.refresh();
    const detected = Object.values((autoDetector == null ? void 0 : autoDetector.detectedDevices) || {}).filter(
      (d) => d.mac && !this.adapter.devices.some((device) => device.mac === d.mac)
    );
    if (!detected.length) {
      await context.showMessage(t("dmNoDevicesDetected"));
      return { refresh: false };
    }
    return this.addDevice(
      context,
      detected.map((d) => ({ label: `${d.type || "?"} - ${d.mac} (${d.ip})`, value: d.ip }))
    );
  }
  /**
   * Instance action: asks for IP and PIN, identifies the device and adds it.
   *
   * @param context action context
   * @param detected detected devices to select from. If not given, the IP is entered.
   */
  async addDevice(context, detected) {
    var _a, _b, _c;
    const schema = {
      type: "panel",
      items: {
        ip: detected ? { type: "select", label: t("dmDetectedDevice"), options: detected, ...FULL_WIDTH } : { type: "text", label: t("ipaddress"), ...FULL_WIDTH },
        pin: { type: "password", label: t("pin"), visible: true, ...FULL_WIDTH },
        name: { type: "text", label: t("name"), ...FULL_WIDTH }
      }
    };
    const data = await context.showForm(schema, {
      data: { ip: detected ? detected[0].value : "", pin: "", name: "" },
      title: detected ? t("dmSearchDevices") : t("dmAddDevice")
    });
    if (!data) {
      return { refresh: false };
    }
    const ip = String((_a = data.ip) != null ? _a : "").trim();
    const pin = String((_b = data.pin) != null ? _b : "").trim();
    if (!ip || !pin) {
      await context.showMessage(t("dmErrorMissingIpOrPin"));
      return { refresh: false };
    }
    const progress = await context.openProgress(t("dmIdentifying"), { indeterminate: true });
    let device;
    try {
      device = await this.adapter.identifyDevice(ip, pin);
    } finally {
      await progress.close();
    }
    if (!device) {
      await context.showMessage(t("dmErrorIdentify", ip));
      return { refresh: false };
    }
    const mac = device.mac;
    const existing = this.adapter.devices.find((d) => d.mac === mac);
    if (existing) {
      await context.showMessage(t("dmErrorDuplicate", existing.name || mac));
      return { refresh: false };
    }
    const name = String((_c = data.name) != null ? _c : "").trim();
    if (name) {
      device.name = name;
    }
    this.adapter.devices.push(device);
    this.scheduleSave();
    await context.showMessage(t("dmDeviceAdded", device.name || device.model));
    return { refresh: true };
  }
  /**
   * Device action: change name, IP, PIN and polling interval.
   *
   * @param id id of the device in the device manager
   * @param context action context
   */
  async editDevice(id, context) {
    var _a, _b, _c, _d;
    const device = this.findDevice(id);
    if (!device) {
      return { refresh: "devices" };
    }
    const schema = {
      type: "panel",
      items: {
        name: { type: "text", label: t("name"), ...FULL_WIDTH },
        ip: { type: "text", label: t("ipaddress"), ...FULL_WIDTH },
        pin: { type: "password", label: t("pin"), visible: true, ...FULL_WIDTH },
        pollInterval: { type: "number", label: t("pollInterval"), min: 0, unit: "ms", ...FULL_WIDTH }
      }
    };
    if (!device.isWebsocket) {
      schema.items.ntpServer = { type: "text", label: t("ntpServer"), help: t("ntpServerHelp"), ...FULL_WIDTH };
    }
    const data = await context.showForm(schema, {
      data: {
        name: device.name,
        ip: device.ip,
        pin: device.pin,
        pollInterval: device.pollInterval,
        ntpServer: device.ntpServer
      },
      title: t("dmEditDevice")
    });
    if (!data) {
      return { refresh: "none" };
    }
    const ip = String((_a = data.ip) != null ? _a : "").trim();
    const pin = String((_b = data.pin) != null ? _b : "").trim();
    if (!ip || !pin) {
      await context.showMessage(t("dmErrorMissingIpOrPin"));
      return { refresh: "none" };
    }
    const pollInterval = Number(data.pollInterval);
    device.name = String((_c = data.name) != null ? _c : "").trim();
    device.ip = ip;
    device.pin = pin;
    device.pollInterval = Number.isFinite(pollInterval) && pollInterval >= 0 ? pollInterval : device.pollInterval;
    if (!device.isWebsocket) {
      device.ntpServer = String((_d = data.ntpServer) != null ? _d : "").trim();
    }
    this.scheduleSave();
    return { refresh: "devices" };
  }
  /**
   * Device action: enable or disable a device.
   *
   * @param id id of the device in the device manager
   */
  toggleEnabled(id) {
    const device = this.findDevice(id);
    if (device) {
      device.enabled = !device.enabled;
      this.scheduleSave();
    }
    return { refresh: "devices" };
  }
  /**
   * Device action: delete a device and its objects. The GUI asked for confirmation already.
   *
   * @param id id of the device in the device manager
   */
  async deleteDevice(id) {
    const device = this.findDevice(id);
    if (device) {
      this.adapter.devices.splice(this.adapter.devices.indexOf(device), 1);
      await this.adapter.deleteDeviceFull(device);
      this.scheduleSave();
    }
    return { refresh: "devices" };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  MydlinkDeviceManagement
});
//# sourceMappingURL=DeviceManagement.js.map
