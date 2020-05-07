/*
    Mostly based on the work of bikerp, see: https://github.com/bikerp/dsp-w215-hnap
    Modifications to fit newer firmware and be used as library by Garfonso.

    The MIT License (MIT)

    Copyright (c) 2015 bikerp

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
*/

const md5 = require('./hmac_md5');
const axios = require('axios');
const DOMParser = require('xmldom').DOMParser;
const AES = require('./AES');
const http = require('http');

const HNAP1_XMLNS = 'http://purenetworks.com/HNAP1/';
//const HNAP_METHOD = 'POST';
//const HNAP_BODY_ENCODING = 'UTF8';
const HNAP_LOGIN_METHOD = 'Login';

/**
 * Creates a soapClient.
 * @param opt - parameters, must have url, user and password.
 */
const soapClient = function (opt = {}) {
    const HNAP_AUTH = {
        url: opt.url || '',
        user: opt.user || '',
        pwd: opt.password || '',
        result: '',
        challenge: '',
        publicKey: '',
        cookie: '',
        privateKey: ''
    };
    //console.debug('New Soapclient with options ', opt);

    const agent = new http.Agent({
        keepAlive: true,
        //maxSockets: 1,
        keepAliveMsecs: 60000,
        timeout: 10000
    });

    //extract tokens from login response into HNAP_AUTH object
    function save_login_result(body) {
        const doc = new DOMParser().parseFromString(body);
        HNAP_AUTH.result = doc.getElementsByTagName(HNAP_LOGIN_METHOD + 'Result').item(0).firstChild.nodeValue;
        HNAP_AUTH.challenge = doc.getElementsByTagName('Challenge').item(0).firstChild.nodeValue;
        HNAP_AUTH.publicKey = doc.getElementsByTagName('PublicKey').item(0).firstChild.nodeValue;
        HNAP_AUTH.cookie = doc.getElementsByTagName('Cookie').item(0).firstChild.nodeValue;
        HNAP_AUTH.privateKey = md5.hex_hmac_md5(HNAP_AUTH.publicKey + HNAP_AUTH.pwd, HNAP_AUTH.challenge).toUpperCase();
    }

    function loginRequest() {
        return '<Action>request</Action>'
            + '<Username>' + HNAP_AUTH.user + '</Username>'
            + '<LoginPassword></LoginPassword>'
            + '<Captcha></Captcha>';
    }

    function loginParameters() {
        const login_pwd = md5.hex_hmac_md5(HNAP_AUTH.privateKey, HNAP_AUTH.challenge);
        return '<Action>login</Action>'
            + '<Username>' + HNAP_AUTH.user + '</Username>'
            + '<LoginPassword>' + login_pwd.toUpperCase() + '</LoginPassword>'
            + '<Captcha></Captcha>';
    }

    function requestBody(method, parameters) {
        return '<?xml version="1.0" encoding="utf-8"?>' +
            '<soap:Envelope ' +
            'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
            'xmlns:xsd="http://www.w3.org/2001/XMLSchema" ' +
            'xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
            '<soap:Body>' +
            '<' + method + ' xmlns="' + HNAP1_XMLNS + '">' +
            parameters +
            '</' + method + '>' +
            '</soap:Body></soap:Envelope>';
    }

    /**
     *
     * @param method
     * @param responseElement
     * @param body
     * @param {boolean} [fullBody] if true will return fullBody xml instead of only result value.
     * @returns {Promise<any>}
     */
    function soapAction(method, responseElement, body, fullBody = false) {
        // @ts-ignore
        return axios.post(HNAP_AUTH.url, body,
            {
                headers: {
                    'Content-Type': 'text/xml; charset=utf-8',
                    'SOAPAction': '"' + HNAP1_XMLNS + method + '"',
                    'HNAP_AUTH': getHnapAuth('"' + HNAP1_XMLNS + method + '"', HNAP_AUTH.privateKey),
                    'cookie': 'uid=' + HNAP_AUTH.cookie
                },
                timeout: 10000, //timeout in ms
                httpAgent: agent
            }).then(function (response) {
            const incomingBody = response.data;
            if (response.status === 403) {
                const e = new Error('Unauthorized, need to login.');
                // @ts-ignore
                e.errno = 403; e.code = 403; e.body = incomingBody;
                throw e;
            }
            console.debug('StatusCode: ' + response.status + ' Body: ' + incomingBody);
            if (fullBody) { //return full body if requested.
                return incomingBody;
            }
            const result = readResponseValue(incomingBody, method + 'Result');
            if (result.toUpperCase() === 'ERROR') {
                throw {text: 'Request not successful. Probably need to login again.', errno: 403, code: 403};
            }
            return readResponseValue(incomingBody, responseElement);
        }).catch(function (err) {
            console.log('error during soapaction:', err);
            throw err;
        });
    }

    function moduleParameters(module) {
        return '<ModuleID>' + module + '</ModuleID>';
    }

    function controlParameters(module, status) {
        return moduleParameters(module) +
            '<NickName>Socket 1</NickName><Description>Socket 1</Description>' +
            '<OPStatus>' + status + '</OPStatus><Controller>1</Controller>';
    }

    function radioParameters(radio) {
        return '<RadioID>' + radio + '</RadioID>';
    }

    function APClientParameters() {
        return '<Enabled>true</Enabled>' +
            '<RadioID>RADIO_2.4GHz</RadioID>' +
            '<SSID>My_Network</SSID>' +
            '<MacAddress>XX:XX:XX:XX:XX:XX</MacAddress>' +
            '<ChannelWidth>0</ChannelWidth>' +
            '<SupportedSecurity>' +
            '<SecurityInfo>' +
            '<SecurityType>WPA2-PSK</SecurityType>' +
            '<Encryptions>' +
            '<string>AES</string>' +
            '</Encryptions>' +
            '</SecurityInfo>' +
            '</SupportedSecurity>' +
            '<Key>' + AES.AES_Encrypt128('password', HNAP_AUTH.privateKey) + '</Key>';
    }

    function groupParameters(group) {
        return '<ModuleGroupID>' + group + '</ModuleGroupID>';
    }
    function temperatureSettingsParameters(module) {
        return moduleParameters(module) +
            '<NickName>TemperatureMonitor 3</NickName>' +
            '<Description>Temperature Monitor 3</Description>' +
            '<UpperBound>80</UpperBound>' +
            '<LowerBound>Not Available</LowerBound>' +
            '<OPStatus>true</OPStatus>';
    }
    function powerWarningParameters() {
        return '<Threshold>28</Threshold>' +
            '<Percentage>70</Percentage>' +
            '<PeriodicType>Weekly</PeriodicType>' +
            '<StartTime>1</StartTime>';
    }

    function getHnapAuth(SoapAction, privateKey) {
        const current_time = new Date();
        const time_stamp = Math.round(current_time.getTime() / 1000);
        const auth = md5.hex_hmac_md5(privateKey, time_stamp + SoapAction);
        return auth.toUpperCase() + ' ' + time_stamp;
    }

    function readResponseValue(body, elementName) {
        if (typeof elementName.forEach === 'function') { //sloppy isArray check.
            const results = {};
            elementName.forEach(function (elemName) {
                results[elemName] = readResponseValue(body, elemName);
            });
            return results;
        } else {
            if (body && elementName) {
                const doc = new DOMParser().parseFromString(body);
                const node = doc.getElementsByTagName(elementName).item(0);
                // Check that we have children of node.
                //if (elementName === 'ModuleTypes') {
                //    console.debug('node: ', node, ' firstChild: ', node.firstChild, ' nodeValue: ', node.firstChild.nodeValue);
                //    console.debug('Content: ', node.textContent);
                //}
                let result = (node && node.firstChild) ? node.firstChild.nodeValue : 'ERROR';
                if (result === null) { //array of values requested like Module Types or SOAP Actions:
                    result = [];
                    //console.debug('Have arrway:', node);
                    Object.keys(node.childNodes).forEach(function (key) {
                        const child = node.childNodes[key];
                        //console.debug('Child:', child);
                        if (child && child.firstChild) {
                            result.push(child.firstChild.nodeValue);
                        }
                    });
                }
                return result;
            }
        }
    }

    function login() {
        //console.log('Login called! Data: ', HNAP_AUTH);
        // @ts-ignore
        return axios.post(HNAP_AUTH.url,
            requestBody(HNAP_LOGIN_METHOD, loginRequest()),
            { //first request challenge and stuff
                headers: {
                    'Content-Type': 'text/xml; charset=utf-8',
                    'SOAPAction': '"' + HNAP1_XMLNS + HNAP_LOGIN_METHOD + '"',
                    'connection': 'keep-alive'
                },
                timeout: 10000,
                httpAgent: agent
            }).then(function (response) { //then log in with the information gathered in first request
            //save keys.
            //console.log('Login request came back: ', response);
            //console.log('Body: ', response.data);
            save_login_result(response.data);
            //console.log('Got results: ', HNAP_AUTH);
            //will return 'success' if worked.
            return soapAction(HNAP_LOGIN_METHOD, 'LoginResult',
                requestBody(HNAP_LOGIN_METHOD, loginParameters()));
        }).catch(function (err) {
            //throw error here, so we can react to it outside (?)
            console.log('error during HNAP login:', err);
            throw err;
        });
    }

    /**
     * Get full device description XMLs -> used to support new devices.
     * @returns {Promise<unknown>}
     */
    function getDeviceDescriptionXML() {
        let promise = soapAction('GetDeviceSettings',
            'Result',
            requestBody('GetDeviceSettings', ''), true); //get full body of DeviceSettings

        const result = {};
        promise = promise.then((deviceSettingsXML) => {
            result.deviceSettingsXML = deviceSettingsXML;
            return soapAction('GetModuleSOAPActions', 'SOAPActions', requestBody('GetModuleSOAPActions', moduleParameters(0)), true);
        });

        promise = promise.then((modulesSoapActions) => {
            result.moduleSoapActions = modulesSoapActions;
            return result;
        });

        return promise;
    }

    //API:
    return {
        login: login,

        close: function () {
            agent.destroy();
        },

        //switches plug on
        on: function () {
            return soapAction('SetSocketSettings', 'SetSocketSettingsResult', requestBody('SetSocketSettings', controlParameters(1, true)));
        },

        //switches plug off
        off: function () {
            return soapAction('SetSocketSettings', 'SetSocketSettingsResult', requestBody('SetSocketSettings', controlParameters(1, false)));
        },

        //polls current state
        state: function () {
            return soapAction('GetSocketSettings', 'OPStatus', requestBody('GetSocketSettings', moduleParameters(1)));
        },

        //polls last detection
        lastDetection: function () {
            return soapAction('GetLatestDetection', 'LatestDetectTime', requestBody('GetLatestDetection', moduleParameters(1))).then(function (res) {
                //console.debug('Latest Detection: ' + res);
                return res * 1000; //make detection time in js timestamp.
            });
        },

        //polls power consumption
        consumption: function () {
            return soapAction('GetCurrentPowerConsumption', 'CurrentConsumption', requestBody('GetCurrentPowerConsumption', moduleParameters(2)));
        },

        //polls total power consumption
        totalConsumption: function () {
            return soapAction('GetPMWarningThreshold', 'TotalConsumption', requestBody('GetPMWarningThreshold', moduleParameters(2)));
        },

        //polls current temperature
        temperature: function () {
            return soapAction('GetCurrentTemperature', 'CurrentTemperature', requestBody('GetCurrentTemperature', moduleParameters(3)));
        },

        //gets information about wifi
        getAPClientSettings: function () {
            return soapAction('GetAPClientSettings', 'GetAPClientSettingsResult', requestBody('GetAPClientSettings', radioParameters('RADIO_2.4GHz')));
        },

        //set power warning?
        setPowerWarning: function () {
            return soapAction('SetPMWarningThreshold', 'SetPMWarningThresholdResult', requestBody('SetPMWarningThreshold', powerWarningParameters()));
        },

        //poll power warning
        getPowerWarning: function () {
            return soapAction('GetPMWarningThreshold', 'GetPMWarningThresholdResult', requestBody('GetPMWarningThreshold', moduleParameters(2)));
        },

        //returns model name and firmware version. Could be very interesting in supporting addtional devices.
        //also useful to know which states to create for a device (i.e. plug or motion detection)
        getDeviceSettings: function () {
            return soapAction('GetDeviceSettings',
                [
                    'GetDeviceSettingsResult',
                    'DeviceMacId',
                    'ModelName',
                    'ModelDescription',
                    'HardwareVersion',
                    'FirmwareVersion',
                    'PresentationURL',
                    'ModuleTypes' //not yet helpfully implemented. Hm
                ],
                requestBody('GetDeviceSettings', ''));
        },

        //not very interesting, returns timezone and set locale.
        getDeviceSettings2: function () {
            return soapAction('GetDeviceSettings2', 'GetDeviceSettings2Result', requestBody('GetDeviceSettings2', ''));
        },

        getTemperatureSettings: function () {
            return soapAction('GetTempMonitorSettings', 'GetTempMonitorSettingsResult', requestBody('GetTempMonitorSettings', moduleParameters(3)));
        },

        setTemperatureSettings: function () {
            return soapAction('SetTempMonitorSettings', 'SetTempMonitorSettingsResult', requestBody('SetTempMonitorSettings', temperatureSettingsParameters(3)));
        },

        getSiteSurvey: function () {
            return soapAction('GetSiteSurvey', 'GetSiteSurveyResult', requestBody('GetSiteSurvey', radioParameters('RADIO_2.4GHz')));
        },

        triggerWirelessSiteSurvey: function () {
            return soapAction('SetTriggerWirelessSiteSurvey', 'SetTriggerWirelessSiteSurveyResult', requestBody('SetTriggerWirelessSiteSurvey', radioParameters('RADIO_2.4GHz')));
        },

        latestDetection: function () {
            return soapAction('GetLatestDetection', 'GetLatestDetectionResult', requestBody('GetLatestDetection', moduleParameters(2)));
        },

        //reboot device
        reboot: function () {
            return soapAction('Reboot', 'RebootResult', requestBody('Reboot', ''));
        },

        isDeviceReady: function () {
            return soapAction('IsDeviceReady', 'IsDeviceReadyResult', requestBody('IsDeviceReady', ''));
        },

        getModuleSchedule: function () {
            return soapAction('GetModuleSchedule', 'GetModuleScheduleResult', requestBody('GetModuleSchedule', moduleParameters(0)));
        },

        getModuleEnabled: function () {
            return soapAction('GetModuleEnabled', 'GetModuleEnabledResult', requestBody('GetModuleEnabled', moduleParameters(0)));
        },

        getModuleGroup: function () {
            return soapAction('GetModuleGroup', 'GetModuleGroupResult', requestBody('GetModuleGroup', groupParameters(0)));
        },

        //get actions supported by module
        getModuleSOAPActions: function (module = 0) {
            return soapAction('GetModuleSOAPActions', 'SOAPActions', requestBody('GetModuleSOAPActions', moduleParameters(module)));
        },

        getMotionDetectorSettings: function(module = 1) {
            return soapAction('GetMotionDetectorSettings', 'GetMotionDetectorSettingsResult', requestBody('GetMotionDetectorSettings', moduleParameters(module)));
        },

        getScheduleSettings: function () {
            return soapAction('GetScheduleSettings', 'GetScheduleSettingsResult', requestBody('GetScheduleSettings', ''));
        },

        setFactoryDefault: function () {
            return soapAction('SetFactoryDefault', 'SetFactoryDefaultResult', requestBody('SetFactoryDefault', ''));
        },

        getWLanRadios: function () {
            return soapAction('GetWLanRadios', 'GetWLanRadiosResult', requestBody('GetWLanRadios', ''));
        },

        getInternetSettings: function () {
            return soapAction('GetInternetSettings', 'GetInternetSettingsResult', requestBody('GetInternetSettings', ''));
        },

        setAPClientSettings: function () {
            return soapAction('SetAPClientSettings', 'SetAPClientSettingsResult', requestBody('SetAPClientSettings', APClientParameters()));
        },

        settriggerADIC: function () {
            return soapAction('SettriggerADIC', 'SettriggerADICResult', requestBody('SettriggerADIC', ''));
        },

        getDeviceDescriptionXML: getDeviceDescriptionXML
    };
};

module.exports = soapClient;

