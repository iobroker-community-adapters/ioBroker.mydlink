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
var soapclient_exports = {};
__export(soapclient_exports, {
  default: () => soapclient_default,
  soapClient: () => soapClient
});
module.exports = __toCommonJS(soapclient_exports);
var crypto = __toESM(require("crypto"));
var import_axios = __toESM(require("axios"));
var import_xmldom = require("@xmldom/xmldom");
var import_http = __toESM(require("http"));
const HNAP1_XMLNS = "http://purenetworks.com/HNAP1/";
const HNAP_LOGIN_METHOD = "Login";
class HNAP_ERROR extends Error {
  constructor(message, errno, body, code = -1) {
    super(message);
    this.errno = errno;
    this.code = code >= 0 ? code : errno;
    this.body = body;
  }
}
function hmac(key, challenge) {
  return crypto.createHmac("md5", key).update(challenge).digest("hex").toUpperCase();
}
const soapClient = function(opt = { url: "", user: "", password: "" }) {
  const HNAP_AUTH = {
    url: opt.url || "",
    user: opt.user || "",
    pwd: opt.password || "",
    result: "",
    challenge: "",
    publicKey: "",
    cookie: "",
    privateKey: ""
  };
  const agent = new import_http.default.Agent({
    keepAlive: true,
    keepAliveMsecs: 6e4,
    timeout: 1e4
  });
  function save_login_result(body) {
    const doc = new import_xmldom.DOMParser().parseFromString(body);
    if (doc) {
      HNAP_AUTH.result = doc.getElementsByTagName(HNAP_LOGIN_METHOD + "Result").item(0).firstChild.nodeValue;
      HNAP_AUTH.challenge = doc.getElementsByTagName("Challenge").item(0).firstChild.nodeValue;
      HNAP_AUTH.publicKey = doc.getElementsByTagName("PublicKey").item(0).firstChild.nodeValue;
      HNAP_AUTH.cookie = doc.getElementsByTagName("Cookie").item(0).firstChild.nodeValue;
      HNAP_AUTH.privateKey = hmac(HNAP_AUTH.publicKey + HNAP_AUTH.pwd, HNAP_AUTH.challenge);
    }
  }
  function loginRequest() {
    return "<Action>request</Action><Username>" + HNAP_AUTH.user + "</Username><LoginPassword></LoginPassword><Captcha></Captcha>";
  }
  function loginParameters() {
    const login_pwd = hmac(HNAP_AUTH.privateKey, HNAP_AUTH.challenge);
    return "<Action>login</Action><Username>" + HNAP_AUTH.user + "</Username><LoginPassword>" + login_pwd + "</LoginPassword><Captcha></Captcha>";
  }
  function requestBody(method, parameters) {
    return '<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><' + method + ' xmlns="' + HNAP1_XMLNS + '">' + parameters + "</" + method + "></soap:Body></soap:Envelope>";
  }
  function soapAction(method, responseElement, body, fullBody = false) {
    return import_axios.default.post(
      HNAP_AUTH.url,
      body,
      {
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          "SOAPAction": '"' + HNAP1_XMLNS + method + '"',
          "HNAP_AUTH": getHnapAuth('"' + HNAP1_XMLNS + method + '"', HNAP_AUTH.privateKey),
          "cookie": "uid=" + HNAP_AUTH.cookie
        },
        timeout: 1e4,
        httpAgent: agent
      }
    ).then(function(response) {
      const incomingBody = response.data;
      if (response.status === 403) {
        throw new HNAP_ERROR("Unauthorized, need to login.", 403, incomingBody);
      }
      console.debug("StatusCode: " + response.status + " Body: " + incomingBody);
      if (fullBody) {
        return incomingBody;
      }
      const result = readResponseValue(incomingBody, method + "Result");
      if (typeof result === "string" && result.toUpperCase() === "ERROR") {
        throw new HNAP_ERROR(
          "Request not successful. Probably need to login again. Status: " + response.status,
          response.status,
          incomingBody,
          response.status < 300 ? 403 : response.status
        );
      }
      return readResponseValue(incomingBody, responseElement);
    }).catch(function(err) {
      console.log("error during soapaction:", err);
      throw err;
    });
  }
  function moduleParameters(module2) {
    return "<ModuleID>" + module2 + "</ModuleID>";
  }
  function controlParameters(module2, status) {
    return moduleParameters(module2) + "<NickName>Socket 1</NickName><Description>Socket 1</Description><OPStatus>" + status + "</OPStatus><Controller>1</Controller>";
  }
  function radioParameters(radio) {
    return "<RadioID>" + radio + "</RadioID>";
  }
  function getSounds() {
    return {
      EMERGENCY: 1,
      FIRE: 2,
      AMBULANCE: 3,
      POLICE: 4,
      DOOR_CHIME: 5,
      BEEP: 6
    };
  }
  function soundParameters(soundnum, volume, duration) {
    let params = `<ModuleID>1</ModuleID>
                     <Controller>1</Controller>`;
    if (soundnum !== void 0) {
      params += `<SoundType>${soundnum}</SoundType>`;
    }
    if (volume !== void 0) {
      params += `<Volume>${volume}</Volume>`;
    }
    if (duration !== void 0) {
      params += `<Duration>${duration}</Duration>`;
    }
    return params;
  }
  function APClientParameters() {
    return "<Enabled>true</Enabled><RadioID>RADIO_2.4GHz</RadioID><SSID>My_Network</SSID><MacAddress>XX:XX:XX:XX:XX:XX</MacAddress><ChannelWidth>0</ChannelWidth><SupportedSecurity><SecurityInfo><SecurityType>WPA2-PSK</SecurityType><Encryptions><string>AES</string></Encryptions></SecurityInfo></SupportedSecurity>";
  }
  function groupParameters(group) {
    return "<ModuleGroupID>" + group + "</ModuleGroupID>";
  }
  function temperatureSettingsParameters(module2) {
    return moduleParameters(module2) + "<NickName>TemperatureMonitor 3</NickName><Description>Temperature Monitor 3</Description><UpperBound>80</UpperBound><LowerBound>Not Available</LowerBound><OPStatus>true</OPStatus>";
  }
  function powerWarningParameters() {
    return "<Threshold>28</Threshold><Percentage>70</Percentage><PeriodicType>Weekly</PeriodicType><StartTime>1</StartTime>";
  }
  function getHnapAuth(SoapAction, privateKey) {
    const current_time = new Date();
    const time_stamp = Math.round(current_time.getTime() / 1e3);
    const auth = hmac(privateKey, time_stamp + SoapAction);
    return auth + " " + time_stamp;
  }
  function readResponseValue(body, elementName) {
    if (typeof elementName === "object" && typeof elementName.forEach === "function") {
      const results = {};
      elementName.forEach(function(elemName) {
        results[elemName] = readResponseValue(body, elemName);
      });
      return results;
    } else {
      if (body && elementName && typeof elementName === "string") {
        const doc = new import_xmldom.DOMParser().parseFromString(body);
        const node = doc.getElementsByTagName(elementName).item(0);
        const result = node && node.firstChild ? node.firstChild.nodeValue : "ERROR";
        if (result === null) {
          const results = [];
          Object.keys(node.childNodes).forEach(function(value, key) {
            const child = node.childNodes[key];
            if (child && child.firstChild) {
              results.push(child.firstChild.nodeValue);
            }
          });
          return results;
        } else {
          return result;
        }
      }
    }
  }
  function login() {
    return import_axios.default.post(
      HNAP_AUTH.url,
      requestBody(HNAP_LOGIN_METHOD, loginRequest()),
      {
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          "SOAPAction": '"' + HNAP1_XMLNS + HNAP_LOGIN_METHOD + '"',
          "connection": "keep-alive"
        },
        timeout: 1e4,
        httpAgent: agent
      }
    ).then(function(response) {
      save_login_result(response.data);
      return soapAction(
        HNAP_LOGIN_METHOD,
        "LoginResult",
        requestBody(HNAP_LOGIN_METHOD, loginParameters())
      );
    }).then((result) => {
      return result === "success";
    }).catch(function(err) {
      console.log("error during HNAP login:", err);
      throw err;
    });
  }
  async function getDeviceDescriptionXML() {
    return {
      deviceSettingsXML: await soapAction(
        "GetDeviceSettings",
        "Result",
        requestBody("GetDeviceSettings", ""),
        true
      ),
      modulesSoapActions: await soapAction(
        "GetModuleSOAPActions",
        "SOAPActions",
        requestBody("GetModuleSOAPActions", moduleParameters("0")),
        true
      )
    };
  }
  return {
    login,
    disconnect: function() {
      agent.destroy();
    },
    switch: function(on) {
      return soapAction("SetSocketSettings", "SetSocketSettingsResult", requestBody("SetSocketSettings", controlParameters(1, on)));
    },
    on: function() {
      return soapAction("SetSocketSettings", "SetSocketSettingsResult", requestBody("SetSocketSettings", controlParameters(1, true)));
    },
    off: function() {
      return soapAction("SetSocketSettings", "SetSocketSettingsResult", requestBody("SetSocketSettings", controlParameters(1, false)));
    },
    state: function() {
      return soapAction("GetSocketSettings", "OPStatus", requestBody("GetSocketSettings", moduleParameters(1)));
    },
    lastDetection: async function() {
      const result = await soapAction("GetLatestDetection", "LatestDetectTime", requestBody("GetLatestDetection", moduleParameters(1)));
      return result * 1e3;
    },
    consumption: function() {
      return soapAction("GetCurrentPowerConsumption", "CurrentConsumption", requestBody("GetCurrentPowerConsumption", moduleParameters(2)));
    },
    totalConsumption: function() {
      return soapAction("GetPMWarningThreshold", "TotalConsumption", requestBody("GetPMWarningThreshold", moduleParameters(2)));
    },
    temperature: function() {
      return soapAction("GetCurrentTemperature", "CurrentTemperature", requestBody("GetCurrentTemperature", moduleParameters(3)));
    },
    getAPClientSettings: function() {
      return soapAction("GetAPClientSettings", "GetAPClientSettingsResult", requestBody("GetAPClientSettings", radioParameters("RADIO_2.4GHz")));
    },
    setPowerWarning: function() {
      return soapAction("SetPMWarningThreshold", "SetPMWarningThresholdResult", requestBody("SetPMWarningThreshold", powerWarningParameters()));
    },
    getPowerWarning: function() {
      return soapAction("GetPMWarningThreshold", "GetPMWarningThresholdResult", requestBody("GetPMWarningThreshold", moduleParameters(2)));
    },
    getDeviceSettings: function() {
      return soapAction(
        "GetDeviceSettings",
        [
          "GetDeviceSettingsResult",
          "DeviceMacId",
          "ModelName",
          "ModelDescription",
          "HardwareVersion",
          "FirmwareVersion",
          "PresentationURL",
          "ModuleTypes"
        ],
        requestBody("GetDeviceSettings", "")
      );
    },
    getDeviceSettings2: function() {
      return soapAction("GetDeviceSettings2", "GetDeviceSettings2Result", requestBody("GetDeviceSettings2", ""));
    },
    getTemperatureSettings: function() {
      return soapAction("GetTempMonitorSettings", "GetTempMonitorSettingsResult", requestBody("GetTempMonitorSettings", moduleParameters(3)));
    },
    setTemperatureSettings: function() {
      return soapAction("SetTempMonitorSettings", "SetTempMonitorSettingsResult", requestBody("SetTempMonitorSettings", temperatureSettingsParameters(3)));
    },
    getSiteSurvey: function() {
      return soapAction("GetSiteSurvey", "GetSiteSurveyResult", requestBody("GetSiteSurvey", radioParameters("RADIO_2.4GHz")));
    },
    triggerWirelessSiteSurvey: function() {
      return soapAction("SetTriggerWirelessSiteSurvey", "SetTriggerWirelessSiteSurveyResult", requestBody("SetTriggerWirelessSiteSurvey", radioParameters("RADIO_2.4GHz")));
    },
    latestDetection: function() {
      return soapAction("GetLatestDetection", "GetLatestDetectionResult", requestBody("GetLatestDetection", moduleParameters(2)));
    },
    reboot: function() {
      return soapAction("Reboot", "RebootResult", requestBody("Reboot", ""));
    },
    isDeviceReady: async function() {
      const result = await soapAction("IsDeviceReady", "IsDeviceReadyResult", requestBody("IsDeviceReady", ""));
      return result === "OK";
    },
    getModuleSchedule: function() {
      return soapAction("GetModuleSchedule", "GetModuleScheduleResult", requestBody("GetModuleSchedule", moduleParameters(0)));
    },
    getModuleEnabled: function() {
      return soapAction("GetModuleEnabled", "GetModuleEnabledResult", requestBody("GetModuleEnabled", moduleParameters(0)));
    },
    getModuleGroup: function() {
      return soapAction("GetModuleGroup", "GetModuleGroupResult", requestBody("GetModuleGroup", groupParameters(0)));
    },
    getModuleSOAPActions: function(module2 = 0) {
      return soapAction("GetModuleSOAPActions", "SOAPActions", requestBody("GetModuleSOAPActions", moduleParameters(module2)));
    },
    getMotionDetectorSettings: function(module2 = 1) {
      return soapAction("GetMotionDetectorSettings", "GetMotionDetectorSettingsResult", requestBody("GetMotionDetectorSettings", moduleParameters(module2)));
    },
    getScheduleSettings: function() {
      return soapAction("GetScheduleSettings", "GetScheduleSettingsResult", requestBody("GetScheduleSettings", ""));
    },
    setFactoryDefault: function() {
      return soapAction("SetFactoryDefault", "SetFactoryDefaultResult", requestBody("SetFactoryDefault", ""));
    },
    getWLanRadios: function() {
      return soapAction("GetWLanRadios", "GetWLanRadiosResult", requestBody("GetWLanRadios", ""));
    },
    getInternetSettings: function() {
      return soapAction("GetInternetSettings", "GetInternetSettingsResult", requestBody("GetInternetSettings", ""));
    },
    setAPClientSettings: function() {
      return soapAction("SetAPClientSettings", "SetAPClientSettingsResult", requestBody("SetAPClientSettings", APClientParameters()));
    },
    settriggerADIC: function() {
      return soapAction("SettriggerADIC", "SettriggerADICResult", requestBody("SettriggerADIC", ""));
    },
    setSoundPlay: function(sound, volume, duration) {
      return soapAction("SetSoundPlay", "SetSoundPlayResult", requestBody("SetSoundPlay", soundParameters(sound, volume, duration)));
    },
    setAlarmDismissed: function() {
      return soapAction("SetAlarmDismissed", "SetAlarmDismissedResult", requestBody("SetAlarmDismissed", soundParameters()));
    },
    getSoundPlay: function() {
      return soapAction("GetSirenAlarmSettings", "IsSounding", requestBody("GetSirenAlarmSettings", soundParameters()));
    },
    getDeviceDescriptionXML,
    getSounds
  };
};
var soapclient_default = soapClient;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  soapClient
});
//# sourceMappingURL=soapclient.js.map