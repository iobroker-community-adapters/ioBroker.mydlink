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
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var utils = __toESM(require("@iobroker/adapter-core"));
var import_node_path = require("node:path");
var import_autoDetect = require("./lib/autoDetect");
var import_TableDevice = require("./lib/TableDevice");
var import_DeviceFactory = require("./lib/DeviceFactory");
var import_DeviceManagement = require("./lib/DeviceManagement");
var import_Config = require("./lib/Config");
class Mydlink extends utils.Adapter {
  /**
   * Array of devices.
   * Device consists of:
   * config: which includes IP, PIN, ... set by the user
   * client: soapclient for interaction with device
   *
   */
  devices = [];
  /**
   * Devices of the instance configuration, PINs decrypted.
   */
  configDevices = [];
  /**
   * Auto-detected devices. Store here and aggregate until we are sure it is mydlink and have mac
   * -> multiple messages.
   *
   */
  autoDetector = void 0;
  /**
   * Set during unload, prevents devices from starting new timers.
   */
  unloading = false;
  /**
   * Communication with the device manager in admin.
   */
  deviceManagement;
  constructor(options = {}) {
    super({
      ...options,
      name: "mydlink"
    });
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("unload", this.onUnload.bind(this));
    this.deviceManagement = new import_DeviceManagement.MydlinkDeviceManagement(this);
  }
  /**
   * deletes all objects of a device and the device itself (deleteDeviceAsync does not work somehow...?)
   *
   * @param device device to delete
   */
  async deleteDeviceFull(device) {
    device.stop();
    await this.deleteDeviceObjects(device.id, device.mac);
  }
  /**
   * deletes all objects of a device id
   *
   * @param id id of the device object (MAC without colons)
   * @param mac MAC of the device
   */
  async deleteDeviceObjects(id, mac) {
    if (!id) {
      return;
    }
    if (this.autoDetector) {
      for (const ip of Object.keys(this.autoDetector.detectedDevices)) {
        const dectDevice = this.autoDetector.detectedDevices[ip];
        if (dectDevice.mac === mac) {
          dectDevice.alreadyPresent = false;
        }
      }
    }
    try {
      const ids = await this.getObjectListAsync({
        startkey: `${this.namespace}.${id}`,
        endkey: `${this.namespace}.${id}\u9999`
      });
      if (ids) {
        for (const obj of ids.rows) {
          await this.delObjectAsync(obj.value._id);
        }
      }
    } catch (e) {
      this.log.error(`Error during deletion of ${id}: ${e.stack}`);
    }
  }
  /**
   * Stores the devices in the instance configuration. js-controller encrypts the PINs and restarts the adapter.
   *
   * @param devices devices with PINs in plain text
   */
  async saveConfigDevices(devices) {
    const copies = devices.map((device) => ({ ...device }));
    this.configDevices = devices;
    await this.updateConfig({ configVersion: import_Config.CONFIG_VERSION, devices: copies });
  }
  /**
   * Store new IP of a device in config. Changing the config restarts the adapter.
   *
   * @param mac MAC of the device
   * @param ip new IP
   */
  async updateDeviceIp(mac, ip) {
    const configDevice = this.configDevices.find((d) => d.mac && (0, import_TableDevice.normalizeMac)(d.mac) === mac);
    if (configDevice && configDevice.ip !== ip) {
      await this.saveConfigDevices(this.configDevices.map((d) => d === configDevice ? { ...d, ip } : d));
    }
  }
  /**
   * Logs in to a device and identifies it. Used to add a new device.
   *
   * @param ip IP of the device
   * @param pin PIN of the device
   * @returns identified device (stopped) or undefined, if login or identification failed
   */
  async identifyDevice(ip, pin) {
    const device = await (0, import_DeviceFactory.createFromTable)(this, { ip, pin });
    if (!device) {
      return void 0;
    }
    try {
      await device.start();
      if (device.loggedIn && device.identified && device.ready && device.mac) {
        return device;
      }
      this.log.info(`Could not log in to device on ${ip}.`);
    } catch (e) {
      this.log.info(`Could not log in to device on ${ip}: ${e.stack}`);
    } finally {
      device.stop();
    }
    if (device.id && !this.devices.some((d) => d.id === device.id)) {
      await this.deleteDeviceObjects(device.id, device.mac);
    }
    return void 0;
  }
  /**
   * Reads the devices from the instance configuration with decrypted PINs.
   * Converts configurations of old versions, which encrypted the PINs themselves.
   *
   * @returns devices or undefined, if the configuration was converted. The adapter restarts then.
   */
  async loadConfigDevices() {
    const config = this.config;
    if (config.configVersion !== import_Config.CONFIG_VERSION) {
      const devices2 = await this.migrateConfig();
      if (devices2.length) {
        this.log.info(
          "Converted configuration, PINs are now encrypted by js-controller. Adapter will restart."
        );
        await this.saveConfigDevices(devices2);
        return void 0;
      }
      return devices2;
    }
    const devices = (config.devices || []).map((device) => ({ ...device }));
    let pins = [];
    try {
      pins = await this.getEncryptedConfig("devices.pin");
    } catch (e) {
      this.log.error(`Could not decrypt PINs: ${e}`);
    }
    devices.forEach((device, index) => {
      const pin = Array.isArray(pins) ? pins[index] : void 0;
      device.pin = typeof pin === "string" ? pin : "";
    });
    return devices;
  }
  /**
   * Reads devices of a configuration of version 1 from the instance object. this.config can not be used, because
   * js-controller might have tried to decrypt PINs that were not encrypted.
   * Also removes the PINs old versions stored in the device objects.
   *
   * @returns devices with decrypted PINs
   */
  async migrateConfig() {
    var _a;
    for (const deviceObject of await this.getDevicesAsync()) {
      if ("pin" in deviceObject.native || "pinNotEncrypted" in deviceObject.native) {
        delete deviceObject.native.pin;
        delete deviceObject.native.pinNotEncrypted;
        await this.setForeignObjectAsync(deviceObject._id, deviceObject);
      }
    }
    const instanceObject = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
    const devices = (instanceObject == null ? void 0 : instanceObject.native.devices) || [];
    if (!devices.length) {
      return [];
    }
    const systemConfig = await this.getForeignObjectAsync("system.config");
    const secret = ((_a = systemConfig == null ? void 0 : systemConfig.native) == null ? void 0 : _a.secret) || import_Config.LEGACY_SECRET;
    return (0, import_Config.migrateLegacyDevices)(devices, secret);
  }
  /**
   * Creates device of a configuration entry. Devices with known model are created without login.
   *
   * @param configDevice entry of the configuration
   * @param deviceObjects existing device objects, to get the model if missing in the configuration
   * @returns device or undefined, if creation failed
   */
  async createConfiguredDevice(configDevice, deviceObjects) {
    var _a, _b;
    const deviceObject = configDevice.mac ? deviceObjects.find((o) => o.native.mac && (0, import_TableDevice.normalizeMac)(o.native.mac) === configDevice.mac) : void 0;
    const model = configDevice.model || (deviceObject == null ? void 0 : deviceObject.native.model);
    const useWebSocket = (_a = configDevice.useWebSocket) != null ? _a : deviceObject == null ? void 0 : deviceObject.native.useWebSocket;
    let device;
    if (configDevice.mac && model) {
      device = await (0, import_DeviceFactory.createDevice)(this, {
        ip: configDevice.ip,
        pin: configDevice.pin,
        model,
        pollInterval: Number(configDevice.pollInterval),
        mac: configDevice.mac,
        name: configDevice.name,
        enabled: configDevice.enabled,
        isWebsocket: useWebSocket
      });
    } else {
      this.log.info(`Model still unknown for ${configDevice.name || configDevice.ip}. Trying to identify.`);
      device = await (0, import_DeviceFactory.createFromTable)(this, configDevice, useWebSocket);
    }
    if (device) {
      device.ntpServer = (_b = configDevice.ntpServer) != null ? _b : "";
    }
    return device;
  }
  /**
   * Is called when databases are connected and adapter received configuration.
   */
  async onReady() {
    await utils.I18n.init((0, import_node_path.join)(__dirname, "..", "admin"), this);
    await this.delObjectAsync("info", { recursive: true });
    const configDevices = await this.loadConfigDevices();
    if (!configDevices) {
      return;
    }
    this.configDevices = configDevices;
    this.autoDetector = new import_autoDetect.AutoDetector(this);
    const deviceObjects = await this.getDevicesAsync();
    this.log.debug(`Got existing devices: ${JSON.stringify(deviceObjects, null, 2)}`);
    this.log.debug(`Got ${configDevices.length} config devices.`);
    for (const configDevice of configDevices.map((d) => ({ ...d }))) {
      (0, import_TableDevice.sanitizeTableDevice)(configDevice);
      const device = await this.createConfiguredDevice(configDevice, deviceObjects);
      if (!device) {
        this.log.error(`Could not create device for config entry with IP: ${configDevice.ip}`);
        continue;
      }
      if (device.mac && this.devices.some((d) => d.mac === device.mac)) {
        device.stop();
        this.log.info(
          `Duplicate entry for ${device.mac} in config. Trying to rectify. Restart will happen. Affected devices: ${device.name} === ${configDevice.name}`
        );
        continue;
      }
      await device.createDeviceObject();
      await device.start();
      await device.createDeviceObject();
      this.devices.push(device);
    }
    for (const deviceObject of deviceObjects) {
      const id = deviceObject._id.split(".")[2];
      if (!this.devices.some((d) => d.id === id)) {
        this.log.debug(`Deleting ${deviceObject.common.name}`);
        await this.deleteDeviceObjects(id, deviceObject.native.mac);
      }
    }
    this.autoDetector.query();
    const devices = this.devices.map(import_Config.deviceToTableDevice);
    if (!(0, import_Config.sameTableDevices)(devices, configDevices)) {
      await this.saveConfigDevices(devices);
    }
  }
  /**
   * Is called when adapter shuts down - callback has to be called under any circumstances!
   *
   * @param callback function to call when cleanup is done
   */
  onUnload(callback) {
    this.unloading = true;
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
      this.log.error(`Error during unload: ${e}`);
      callback();
    }
  }
  /**
   * Is called if a subscribed state changes
   *
   * @param id id of changed state object
   * @param state changed state
   */
  async onStateChange(id, state) {
    if (state) {
      this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
      if (!state.ack) {
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
}
if (require.main !== module) {
  module.exports = (options) => new Mydlink(options);
} else {
  (() => new Mydlink())();
}
//# sourceMappingURL=main.js.map
