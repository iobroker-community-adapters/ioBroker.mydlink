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
var SoapSierene_exports = {};
__export(SoapSierene_exports, {
  SoapSieren: () => SoapSieren
});
module.exports = __toCommonJS(SoapSierene_exports);
var import_suffixes = require("./suffixes");
var import_soapDevice = require("./soapDevice");
class SoapSieren extends import_soapDevice.SoapDevice {
  constructor() {
    super(...arguments);
    this.soundToPlay = 1;
    this.volume = 100;
    this.duration = 10;
  }
  async handleStateChange(id, state) {
    await super.handleStateChange(id, state);
    if (id.endsWith(import_suffixes.Suffixes.state)) {
      if (typeof state.val === "boolean") {
        try {
          await this.client.switch(state.val);
          const newVal = await this.client.state();
          await this.adapter.setStateAsync(id, newVal, true);
        } catch (e) {
          await this.handleNetworkError(e);
        }
      } else {
        this.adapter.log.warn("Wrong state type. Only boolean accepted for switch.");
      }
    } else {
      if (id.endsWith(import_suffixes.Suffixes.soundType)) {
        if (typeof state.val === "number" && state.val >= 1 && state.val <= 6) {
          this.soundToPlay = state.val;
        } else {
          this.adapter.log.warn(`Wrong value ${state.val} for sound. Expected number in range 1-6 for ${id}`);
        }
      } else if (id.endsWith(import_suffixes.Suffixes.soundVolume)) {
        if (typeof state.val === "number" && state.val >= 1 && state.val <= 100) {
          this.volume = state.val;
        } else {
          this.adapter.log.warn(`Wrong value ${state.val} for volume. Expected number in range 1-100 for ${id}`);
        }
      } else if (id.endsWith(import_suffixes.Suffixes.soundDuration)) {
        if (typeof state.val === "number" && state.val >= 1 && state.val <= 88888) {
          this.duration = state.val;
        } else {
          this.adapter.log.warn(`Wrong value ${state.val} for duration. Expected number in range 1-88888 (where 88888 means infinite) for ${id}`);
        }
      } else {
        this.adapter.log.warn(`State ${id} set to ${state.val} and ack=false, but can't control anything with it.`);
      }
    }
  }
  async createObjects() {
    await super.createObjects();
    await this.adapter.setObjectNotExistsAsync(this.id + import_suffixes.Suffixes.state, {
      type: "state",
      common: {
        name: "state of sirene",
        type: "boolean",
        role: "switch",
        read: true,
        write: true
      },
      native: {}
    });
    await this.adapter.subscribeStatesAsync(this.id + import_suffixes.Suffixes.state);
    await this.adapter.setObjectNotExistsAsync(this.id + import_suffixes.Suffixes.soundType, {
      type: "state",
      common: {
        name: "sound to play on next play",
        type: "number",
        role: "level.mode.sound",
        read: true,
        write: true,
        min: 1,
        max: 6,
        states: {
          1: "EMERGENCY",
          2: "FIRE",
          3: "AMBULANCE",
          4: "POLICE",
          5: "DOOR_CHIME",
          6: "BEEP"
        }
      },
      native: {}
    });
    await this.adapter.subscribeStatesAsync(this.id + import_suffixes.Suffixes.soundType);
    await this.adapter.setObjectNotExistsAsync(this.id + import_suffixes.Suffixes.soundVolume, {
      type: "state",
      common: {
        name: "volume of sirene on next play",
        type: "number",
        role: "level.volume",
        read: true,
        write: true,
        min: 1,
        max: 100
      },
      native: {}
    });
    await this.adapter.subscribeStatesAsync(this.id + import_suffixes.Suffixes.soundVolume);
    await this.adapter.setObjectNotExistsAsync(this.id + import_suffixes.Suffixes.soundDuration, {
      type: "state",
      common: {
        name: "duration of sirene on next play (88888 = infinite)",
        type: "number",
        role: "level.timer",
        read: true,
        write: true,
        unit: "s",
        min: 1,
        max: 88888
      },
      native: {}
    });
    await this.adapter.subscribeStatesAsync(this.id + import_suffixes.Suffixes.soundVolume);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  SoapSieren
});
//# sourceMappingURL=SoapSierene.js.map
