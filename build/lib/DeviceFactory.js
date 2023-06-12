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
var DeviceFactory_exports = {};
__export(DeviceFactory_exports, {
  createDevice: () => createDevice,
  createFromObject: () => createFromObject,
  createFromTable: () => createFromTable
});
module.exports = __toCommonJS(DeviceFactory_exports);
var import_Device = require("./Device");
var import_KnownDevices = require("./KnownDevices");
var import_WebSocketDevice = require("./WebSocketDevice");
var import_soapDevice = require("./soapDevice");
function deviceObjetToTableDevice(configDevice) {
  return {
    name: configDevice.native.name,
    mac: configDevice.native.mac,
    ip: configDevice.native.ip,
    pin: configDevice.native.pin,
    pollInterval: configDevice.native.pollInterval,
    enabled: configDevice.native.enabled
  };
}
async function sendModelInfoToSentry(adapter, model, xml) {
  if (!import_KnownDevices.KnownDevices[model]) {
    adapter.log.info("Found new device, please report the following (full log from file, please) to developer: " + JSON.stringify(xml, null, 2));
    if (adapter.supportsFeature && adapter.supportsFeature("PLUGINS")) {
      const sentryInstance = adapter.getPluginInstance("sentry");
      if (sentryInstance) {
        const Sentry = sentryInstance.getSentryObject();
        if (Sentry) {
          Sentry.withScope((scope) => {
            scope.setLevel("info");
            for (const key of Object.keys(xml)) {
              scope.setExtra(key, xml[key]);
            }
            Sentry.captureMessage("Unknown-Device " + model, "info");
          });
        }
      }
    }
  }
}
async function createFromObject(adapter, configDevice) {
  const native = configDevice.native;
  const pinEncrypted = native.mac && !native.pinNotEncrypted;
  if (native.model) {
    return createDevice(adapter, {
      ip: native.ip,
      pin: native.pin,
      pinEncrypted,
      model: native.model,
      pollInterval: native.pollInterval,
      mac: native.mac,
      id: configDevice._id.split(".")[2],
      name: native.name,
      enabled: native.enabled,
      isWebsocket: native.useWebsocket
    });
  } else {
    adapter.log.info(`Model still unknown for ${native.name}. Trying to identify.`);
    return createFromTable(adapter, deviceObjetToTableDevice(configDevice), pinEncrypted, native.useWebsocket);
  }
}
async function createDevice(adapter, params) {
  let device;
  const deviceFlags = import_KnownDevices.KnownDevices[params.model];
  if (deviceFlags) {
    device = new deviceFlags.DeviceType(adapter, params.ip, params.pin, params.pinEncrypted);
    if (typeof deviceFlags.moreSetup === "function") {
      deviceFlags.moreSetup(device);
    }
  } else {
    adapter.log.info(`Unknown device type ${params.model} for ${params.name}.`);
    try {
      let info;
      if (params.isWebsocket) {
        device = new import_WebSocketDevice.WebSocketDevice(adapter, params.ip, params.pin, params.pinEncrypted);
        const body = await device.getModelInfoForSentry();
        info = { info: "UNKNOWN WEBSOCKET DEVICE: " + params.model, body };
      } else {
        device = new import_soapDevice.SoapDevice(adapter, params.ip, params.pin, params.pinEncrypted);
        info = await device.client.getDeviceDescriptionXML();
      }
      await sendModelInfoToSentry(adapter, params.model, info);
    } catch (e) {
      adapter.log.error("Could not send device information to sentry. Please report. Error was: " + e.stack);
    }
  }
  device.pollInterval = params.pollInterval || device.pollInterval;
  device.mac = params.mac || device.mac;
  device.id = params.id || device.id;
  if (!device.id) {
    device.idFromMac();
  }
  device.name = params.name || device.name;
  device.model = params.model;
  device.enabled = params.enabled !== void 0 ? params.enabled : device.enabled;
  device.isWebsocket = params.isWebsocket !== void 0 ? params.isWebsocket : device.isWebsocket;
  return device;
}
async function createFromTable(adapter, tableDevice, doDecrypt = false, forceWebsocket = false) {
  const pinEncrypted = doDecrypt && Boolean(tableDevice.mac);
  const mac = tableDevice.mac ? tableDevice.mac.toUpperCase() : "";
  let device;
  if (!forceWebsocket) {
    device = new import_soapDevice.SoapDevice(adapter, tableDevice.ip, tableDevice.pin, pinEncrypted);
  } else {
    device = new import_WebSocketDevice.WebSocketDevice(adapter, tableDevice.ip, tableDevice.pin, pinEncrypted);
  }
  device.mac = mac;
  device.pollInterval = tableDevice.pollInterval !== void 0 && isFinite(Number(tableDevice.pollInterval)) && tableDevice.pollInterval >= 0 ? Number(tableDevice.pollInterval) : 3e4;
  if (device.mac) {
    device.idFromMac();
  }
  device.name = tableDevice.name || device.name;
  device.enabled = tableDevice.enabled !== void 0 ? tableDevice.enabled : device.enabled;
  try {
    await device.login();
    if (device.loggedIn) {
      await device.identify();
    } else {
      if (!forceWebsocket) {
        adapter.log.debug(`${device.name} could not login with SOAP, try websocket.`);
        return createFromTable(adapter, tableDevice, doDecrypt, true);
      } else {
        throw new Error("Device not logged in... why?");
      }
    }
  } catch (e) {
    device.stop();
    const code = (0, import_Device.processNetworkError)(e);
    if (!forceWebsocket && (code === 500 || code === "ECONNREFUSED")) {
      return createFromTable(adapter, tableDevice, doDecrypt, true);
    }
    if (e.name === import_Device.WrongModelError.errorName) {
      adapter.log.debug(`Found ${device.model} for ${device.name}. Create a fitting device.`);
      return createDevice(adapter, {
        model: device.model,
        ip: device.ip,
        pinEncrypted: false,
        pin: device.pinDecrypted,
        name: device.name,
        mac: device.mac,
        pollInterval: device.pollInterval,
        id: device.id,
        isWebsocket: device.isWebsocket,
        enabled: device.enabled
      });
    }
    if (e.name === import_Device.WrongMacError.errorName) {
      adapter.log.info(`Device with unexpected MAC ${device.mac} reacted on ${device.ip}. Trying to create new device object for it.`);
      if (device.model) {
        return createDevice(adapter, {
          model: device.model,
          ip: device.ip,
          pinEncrypted: false,
          pin: device.pinDecrypted,
          name: device.name,
          mac: device.mac,
          pollInterval: device.pollInterval,
          id: device.id,
          isWebsocket: device.isWebsocket,
          enabled: device.enabled
        });
      } else {
        return createFromTable(adapter, {
          mac: device.mac,
          ip: device.ip,
          pin: device.pinDecrypted,
          name: device.name,
          pollInterval: device.pollInterval,
          enabled: device.enabled
        });
      }
    }
    adapter.log.debug("Login error: " + e.stack);
    if (!device.loginErrorPrinted && e.code !== "ETIMEDOUT" && e.code !== "ECONNABORTED" && e.code !== "ECONNRESET") {
      adapter.log.error(tableDevice.name + " could not login. Please check credentials and if device is online/connected. Error: " + e.code + " - " + e.stack);
      device.loginErrorPrinted = true;
    }
    device.loggedIn = false;
  }
  return device;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createDevice,
  createFromObject,
  createFromTable
});
//# sourceMappingURL=DeviceFactory.js.map
