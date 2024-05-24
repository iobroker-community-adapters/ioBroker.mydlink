/*
    Mostly based on the work of bikerp, see: https://github.com/bikerp/dsp-w215-hnap
    Modifications to fit newer firmware and be used as library by Garfonso.

    Control of Sirens possible because of mtfluds work here: https://github.com/mtflud/DCH-S220-Web-Control

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

import * as crypto from 'crypto';
import axios from 'axios';
import {DOMParser} from '@xmldom/xmldom';
import http from 'http';

const HNAP1_XMLNS = 'http://purenetworks.com/HNAP1/';
//const HNAP_METHOD = 'POST';
//const HNAP_BODY_ENCODING = 'UTF8';
const HNAP_LOGIN_METHOD = 'Login';

class HNAP_ERROR extends Error {
    errno: number;
    code: number;
    body: string;
    constructor(message: string, errno : number, body: string, code = -1) {
        super(message);
        this.errno = errno;
        this.code = code >= 0 ? code : errno;
        this.body = body;
    }
}

/**
 * Encrypt stuff like we need it with HNAP. No clue, what I am doing here. Ignore name of parameters. ;-)
 * @param key
 * @param challenge
 */
function hmac(key : string, challenge : string): string {
    return crypto.createHmac('md5', key).update(challenge).digest('hex').toUpperCase();
}

/**
 * Creates a soapClient.
 * @param opt - parameters, must have url, user and password.
 */
export const soapClient = function (opt = { url: '', user: '', password: ''}) : Record<string, unknown> {
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
    function save_login_result(body : string) : void {
        const doc = new DOMParser().parseFromString(body);
        if (doc) {
            HNAP_AUTH.result = doc.getElementsByTagName(HNAP_LOGIN_METHOD + 'Result')!.item(0)!.firstChild!.nodeValue!;
            HNAP_AUTH.challenge = doc.getElementsByTagName('Challenge')!.item(0)!.firstChild!.nodeValue!;
            HNAP_AUTH.publicKey = doc.getElementsByTagName('PublicKey')!.item(0)!.firstChild!.nodeValue!;
            HNAP_AUTH.cookie = doc.getElementsByTagName('Cookie')!.item(0)!.firstChild!.nodeValue!;
            HNAP_AUTH.privateKey = hmac(HNAP_AUTH.publicKey + HNAP_AUTH.pwd, HNAP_AUTH.challenge);
        }
    }

    function loginRequest() : string {
        return '<Action>request</Action>'
            + '<Username>' + HNAP_AUTH.user + '</Username>'
            + '<LoginPassword></LoginPassword>'
            + '<Captcha></Captcha>';
    }

    function loginParameters() : string {
        const login_pwd = hmac(HNAP_AUTH.privateKey, HNAP_AUTH.challenge);
        return '<Action>login</Action>'
            + '<Username>' + HNAP_AUTH.user + '</Username>'
            + '<LoginPassword>' + login_pwd + '</LoginPassword>'
            + '<Captcha></Captcha>';
    }

    function requestBody(method : string, parameters : string) : string {
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
    function soapAction(method : string, responseElement : string | Array<string>, body : string, fullBody = false) : Promise<string | number | boolean | Array<string> | Record<string, string>> {
        //console.log('Sending Body ' + body);
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
                throw new HNAP_ERROR('Unauthorized, need to login.', 403, incomingBody);
            }
            console.debug('StatusCode: ' + response.status + ' Body: ' + incomingBody);
            if (fullBody) { //return full body if requested.
                return incomingBody;
            }
            const result = readResponseValue(incomingBody, method + 'Result');
            if (typeof result === 'string' && result.toUpperCase() === 'ERROR') {
                throw new HNAP_ERROR(
                    'Request not successful. Probably need to login again. Status: ' + response.status,
                    response.status, incomingBody, response.status < 300 ? 403 : response.status);
            }
            return readResponseValue(incomingBody, responseElement);
        }).catch(function (err) {
            console.log('error during soapaction:', err);
            throw err;
        });
    }

    function moduleParameters(module : string | number) : string {
        return '<ModuleID>' + module + '</ModuleID>';
    }

    function controlParameters(module : string | number, status : string | boolean) : string {
        return moduleParameters(module) +
            '<NickName>Socket 1</NickName><Description>Socket 1</Description>' +
            '<OPStatus>' + status + '</OPStatus><Controller>1</Controller>';
    }

    function radioParameters(radio : string) : string {
        return '<RadioID>' + radio + '</RadioID>';
    }

    /**
     * Returns an Object of possible sounds with LABELS and the numbers they translate in.
     * @returns {{EMERGENCY: number, DOOR_CHIME: number, BEEP: number, AMBULANCE: number, FIRE: number, POLICE: number}}
     */
    function getSounds() : {EMERGENCY: number, DOOR_CHIME: number, BEEP: number, AMBULANCE: number, FIRE: number, POLICE: number} {
        return {
            EMERGENCY: 1,
            FIRE: 2,
            AMBULANCE: 3,
            POLICE: 4,
            DOOR_CHIME: 5,
            BEEP: 6
        };
    }

    /**
     * Create parameters for SetPlaySound request
     * @param [soundnum] should be one of the string from getSounds 1-6
     * @param [volume] 1-100
     * @param [duration] 1-88888 (with 88888 = infinite)
     * @returns {string}
     */
    function soundParameters(soundnum? : number, volume? : number, duration? : number) : string {
        let params = `<ModuleID>1</ModuleID>
                     <Controller>1</Controller>`;
        if (soundnum !== undefined) {
            params += `<SoundType>${soundnum}</SoundType>`;
        }
        if (volume !== undefined) {
            params += `<Volume>${volume}</Volume>`;
        }
        if (duration !== undefined) {
            params += `<Duration>${duration}</Duration>`;
        }
        return params;
    }

    function APClientParameters() : string {
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
            '';//'<Key>' + AES.AES_Encrypt128('password', HNAP_AUTH.privateKey) + '</Key>'; //TODO: commented out.. do I need that at all??
    }

    function groupParameters(group : string | number) : string {
        return '<ModuleGroupID>' + group + '</ModuleGroupID>';
    }
    function temperatureSettingsParameters(module : string | number) : string {
        return moduleParameters(module) +
            '<NickName>TemperatureMonitor 3</NickName>' +
            '<Description>Temperature Monitor 3</Description>' +
            '<UpperBound>80</UpperBound>' +
            '<LowerBound>Not Available</LowerBound>' +
            '<OPStatus>true</OPStatus>';
    }
    function powerWarningParameters() : string {
        return '<Threshold>28</Threshold>' +
            '<Percentage>70</Percentage>' +
            '<PeriodicType>Weekly</PeriodicType>' +
            '<StartTime>1</StartTime>';
    }

    function getHnapAuth(SoapAction : string, privateKey : string) : string {
        const current_time = new Date();
        const time_stamp = Math.round(current_time.getTime() / 1000);
        const auth = hmac(privateKey,time_stamp + SoapAction);
        return auth + ' ' + time_stamp;
    }

    function readResponseValue(body : string, elementName : string | Array<string>) : string | number | boolean | Array<string> | Record<string, string> | undefined {
        if (typeof elementName === 'object' && typeof elementName.forEach === 'function') { //sloppy isArray check.
            const results = {} as Record<string, string>;
            elementName.forEach(function (elemName : string): void {
                results[elemName] = readResponseValue(body, elemName) as string;
            });
            return results;
        } else {
            if (body && elementName && typeof elementName === 'string') {
                const doc = new DOMParser().parseFromString(body);
                const node = doc.getElementsByTagName(elementName).item(0);
                // Check that we have children of node.
                //if (elementName === 'ModuleTypes') {
                //    console.debug('node: ', node, ' firstChild: ', node.firstChild, ' nodeValue: ', node.firstChild.nodeValue);
                //    console.debug('Content: ', node.textContent);
                //}
                const result = (node && node.firstChild) ? node.firstChild.nodeValue : 'ERROR';
                if (result === null) { //array of values requested like Module Types or SOAP Actions:
                    const results = [] as Array<string>;
                    //console.debug('Have array:', node);
                    Object.keys(node!.childNodes).forEach(function (value : string, key : number) {
                        const child = node!.childNodes[key];
                        //console.debug('Child:', child);
                        if (child && child.firstChild) {
                            results.push(child.firstChild.nodeValue as string);
                        }
                    });
                    return results;
                } else {
                    return result;
                }
            }
        }
    }

    function login() : Promise<boolean> {
        //console.log('Sending Body ' + loginRequest());
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
        }).then((result) => {
            return result === 'success';
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
    async function getDeviceDescriptionXML() : Promise<{deviceSettingsXML: string, modulesSoapActions: string}> {
        return {
            deviceSettingsXML: await soapAction('GetDeviceSettings',
                'Result',
                requestBody('GetDeviceSettings', ''), true) as string,
            modulesSoapActions: await soapAction('GetModuleSOAPActions',
                'SOAPActions',
                requestBody('GetModuleSOAPActions', moduleParameters('0')), true) as string
        }; //get full body of DeviceSettings
    }

    //API:
    return {
        login: login,

        disconnect: function () {
            agent.destroy();
        },

        /**
         * Switches Plug
         * @param {boolean} on target status
         * @returns {Promise<*>}
         */
        switch: function (on : boolean) {
            return soapAction('SetSocketSettings', 'SetSocketSettingsResult', requestBody('SetSocketSettings', controlParameters(1, on)));
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
        state: async function () {
            const val = await soapAction('GetSocketSettings', 'OPStatus', requestBody('GetSocketSettings', moduleParameters(1)));
            return val === 'true';
        },

        //polls last detection
        lastDetection: async function () {
            const result = await soapAction('GetLatestDetection', 'LatestDetectTime', requestBody('GetLatestDetection', moduleParameters(1))) as number;
            return result * 1000;
        },

        //polls power consumption
        consumption: async function () {
            const result = await soapAction('GetCurrentPowerConsumption', 'CurrentConsumption', requestBody('GetCurrentPowerConsumption', moduleParameters(2)));
            return Number(result);
        },

        //polls total power consumption
        totalConsumption: async function () {
            const result = await soapAction('GetPMWarningThreshold', 'TotalConsumption', requestBody('GetPMWarningThreshold', moduleParameters(2)));
            return Number(result);
        },

        //polls current temperature
        temperature: async function () {
            const result = await soapAction('GetCurrentTemperature', 'CurrentTemperature', requestBody('GetCurrentTemperature', moduleParameters(3)));
            return Number(result);
        },

        //gets information about Wi-Fi
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

        //returns model name and firmware version. Could be very interesting for supporting additional devices.
        //also useful to know which states to create for a device (i.e. plug or motion detection)
        getDeviceSettings: function () : Promise<Record<string, string>> {
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
                requestBody('GetDeviceSettings', '')) as Promise<Record<string, string>>;
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

        /**
         * Returns true if device is ready.
         * @returns {Promise<boolean>}
         */
        isDeviceReady: async function () {
            const result = await soapAction('IsDeviceReady', 'IsDeviceReadyResult', requestBody('IsDeviceReady', ''));
            return result === 'OK';
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

        setSoundPlay: function (sound : number, volume : number, duration : number) {
            return soapAction('SetSoundPlay', 'SetSoundPlayResult', requestBody('SetSoundPlay', soundParameters(sound, volume, duration)));
        },

        setAlarmDismissed: function () {
            return soapAction('SetAlarmDismissed', 'SetAlarmDismissedResult', requestBody('SetAlarmDismissed', soundParameters()));
        },

        getSoundPlay: async function () {
            const result = await soapAction('GetSirenAlarmSettings', 'IsSounding', requestBody('GetSirenAlarmSettings', soundParameters()));
            return result === 'true';
        },

        getDeviceDescriptionXML: getDeviceDescriptionXML,

        getSounds: getSounds
    };
};

export default soapClient;

