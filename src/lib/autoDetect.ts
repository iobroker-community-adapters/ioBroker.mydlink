/// <reference types="./mdns-discovery" />

import { Mydlink } from './mydlink';
import MulticastDNS from 'mdns-discovery';

import { WebSocketDevice } from './WebSocketDevice';

export class AutoDetector {
    mdns: MulticastDNS;

    adapter: Mydlink;

    detectedDevices: Record<string, any> = {};

    debug = false;

    logDebug(message: string) : void {
        if (this.debug) {
            this.adapter.log.debug(message);
        }
    }

    async onDetection(entry : { ip: string, type: string, name: string, mac: string | undefined, PTR: any | undefined, TXT : any | undefined}) : Promise<void> {
        //format of data: length-byte + text + length-byte + text + length-byte + text ...
        function extractStringsFromBuffer(buffer : Buffer) : string[] {
            let index = 0;
            const strings = [];
            while(index < buffer.length) {
                const length = buffer.readInt8(index);
                index += 1;
                strings.push(buffer.subarray(index, index + length).toString());
                index += length;
            }
            return strings;
        }

        //somehow starts to detect fritzbox later on??
        if (entry.name !== '_dhnap._tcp.local' && entry.name !== '_dcp._tcp.local') {
            //this.log.debug('Ignoring false detection? -> ' + entry.ip + ' - ' + entry.name);
            return;
        }
        if (entry.name === '_dcp._tcp.local') {
            this.logDebug('Maybe detected websocket device');
            console.log(entry);
            //get model:
            let model;
            if (entry.PTR && entry.PTR.data) {
                model = entry.PTR.data.substring(0, 8);
            }

            //somehow I get records for devices from wrong IP. or they report devices, they detect under their IP?? not sure...
            //let's connect here and get the MAC -> so we can securely identify the device.
            //then decide if it is a new one (update & present in UI) or an old one (ignore for now).
            const newDevice = new WebSocketDevice(this.adapter, entry.ip, 'INVALID', false);
            newDevice.model = model;

            try {
                await newDevice.client.login();
                newDevice.id = newDevice.client.getDeviceId().toUpperCase();
                if (newDevice.id) {
                    newDevice.mac = newDevice.id.match(/.{2}/g)!.join(':');
                    this.logDebug(`Got websocket device ${model} on ${newDevice.ip}`);
                }
            } catch (e: any) {
                this.logDebug('Could not identify websocket device: ' + e.stack);
            } finally {
                newDevice.stop();
            }

            //now use mac to check if we already now that device:
            const device = this.adapter.devices.find(device => device.mac === entry.mac);
            if (device) {
                this.logDebug(`Device was already present as ${device.model} on ${device.ip}`);
                if (device.ip === newDevice.ip && device.model !== newDevice.model) {
                    this.logDebug(`Model still differs? ${device.model} != ${newDevice.model}`);
                    if (model && device.isWebsocket) {
                        this.logDebug('Updated model to ' + model);
                        device.model = model;
                        await device.createDeviceObject(); //store new model in config.
                    }
                }
            } else { //not known yet, add to detected devices:
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

        //this.log.debug('Got discovery: ' + JSON.stringify(entry, null, 2));
        if (entry.TXT && entry.TXT.data) {
            //build detected device and fill it:
            let device = this.detectedDevices[entry.ip];
            if (!device) {
                device = {
                    ip: entry.ip,
                    name: entry.name
                };
            }

            //parse buffer:
            const keyValuePairs = extractStringsFromBuffer(entry.TXT.data);
            for (const pair of keyValuePairs) {
                const [ key, value ] = pair.split('=');
                switch(key.toLowerCase()) {
                    //extract mac from buffer:
                    case 'mac': {
                        device.mac = value.toUpperCase();
                        break;
                    }
                    //extract model number from buffer:
                    case 'model_number': {
                        device.type = value;
                        break;
                    }
                    //if mydlink=true -> we should look at that device! :)
                    case 'mydlink': {
                        if (value === 'true') {
                            device.mydlink = true; //ok, great :-)
                        }
                    }
                }
            }

            if (device.mydlink) {
                this.detectedDevices[device.ip] = device;
                const oldDevice = this.adapter.devices.find(d => d.mac === device.mac);
                if (oldDevice) {
                    //update model, if differs.
                    if (oldDevice.model !== device.type) {
                        oldDevice.model = device.type;
                    }
                    //found device we already know. Let's check ip.
                    if (device.ip !== oldDevice.ip) {
                        oldDevice.ip = device.ip;
                        await oldDevice.createDeviceObject(); //store IP in config.
                        await oldDevice.start();
                    }
                    device.alreadyPresent = true;
                }
                this.logDebug('Detected Device now is: ' + JSON.stringify(device, null, 2));
            }
        }
    }

    close () {
        if (this.mdns && typeof this.mdns.close === 'function') {
            this.mdns.close();
        }
    }

    constructor (adapter : Mydlink) {
        this.adapter = adapter;
        this.mdns = new MulticastDNS({
            timeout: 0, //0 == stay active??
            name: [ '_dhnap._tcp.local', '_dcp._tcp.local' ],
            find: '*',
            broadcast: false
        });


        this.logDebug('Auto detection started');
        if (this.mdns !== undefined) {
            this.mdns.on('entry', this.onDetection.bind(this));
            this.mdns.run(() => adapter.log.info('Discovery done'));
        }
    }
}
