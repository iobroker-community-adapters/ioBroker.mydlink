import type { Mydlink } from './mydlink';
import makeMdns from 'multicast-dns';
import type { MulticastDNS } from 'multicast-dns';
import type { Answer, StringAnswer, TxtAnswer, TxtData } from 'dns-packet';
import type { RemoteInfo } from 'node:dgram';

import { WebSocketDevice } from './WebSocketDevice';
import { normalizeMac } from './TableDevice';

const SOAP_SERVICE = '_dhnap._tcp.local';
const WEBSOCKET_SERVICE = '_dcp._tcp.local';

/**
 * Minimum time between two mDNS queries triggered by the admin dialog.
 */
const MIN_QUERY_INTERVAL = 30000;

/**
 * Information about a detected device, sent to the admin dialog.
 */
export interface DetectedDevice {
    /** IP address of the device. */
    ip: string;
    /** mDNS service name the device was detected with. */
    name: string;
    /** Model of the device. */
    type?: string;
    /** MAC address of the device. */
    mac?: string;
    /** Device announced itself as mydlink device. */
    mydlink?: boolean;
    /** Device needs to be controlled via websocket. */
    useWebSocket?: boolean;
    /** Device is already configured. */
    alreadyPresent?: boolean;
    /** Admin dialog must not change this entry. */
    readOnly?: boolean;
}

/**
 * Auto-detection of devices via mDNS.
 */
export class AutoDetector {
    mdns: MulticastDNS;

    adapter: Mydlink;

    detectedDevices: Record<string, DetectedDevice> = {};

    lastQuery = 0;

    /**
     * Send mDNS query for all D-Link services.
     */
    query(): void {
        this.lastQuery = Date.now();
        this.mdns.query({
            questions: [
                { name: SOAP_SERVICE, type: 'PTR' },
                { name: WEBSOCKET_SERVICE, type: 'PTR' },
            ],
        });
    }

    /**
     * Query again, if last query is some time ago. Used while admin dialog is open.
     */
    refresh(): void {
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
    async onResponse(
        packet: { answers?: Answer[]; additionals?: Answer[] },
        rinfo: Pick<RemoteInfo, 'address'>,
    ): Promise<void> {
        const records = [...(packet.answers || []), ...(packet.additionals || [])];
        const ptr = records.find(
            (r): r is StringAnswer => r.type === 'PTR' && (r.name === SOAP_SERVICE || r.name === WEBSOCKET_SERVICE),
        );
        if (!ptr) {
            return; //not a D-Link device.
        }
        const txt = records.find((r): r is TxtAnswer => r.type === 'TXT');
        await this.onDetection({
            ip: rinfo.address,
            name: ptr.name,
            ptrData: ptr.data,
            txt: txt ? txtToStrings(txt.data) : undefined,
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
    async onDetection(entry: { ip: string; name: string; ptrData: string; txt: string[] | undefined }): Promise<void> {
        if (entry.name === WEBSOCKET_SERVICE) {
            const alreadyDetected = this.detectedDevices[entry.ip];
            if (alreadyDetected && alreadyDetected.mac) {
                return; //already identified, no need to log in again.
            }
            this.adapter.log.debug(`Maybe detected websocket device on ${entry.ip}`);
            //get model:
            const model = entry.ptrData ? entry.ptrData.substring(0, 8) : '';

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
                    this.adapter.log.debug(`Got websocket device ${model} on ${newDevice.ip}`);
                }
            } catch (e: any) {
                this.adapter.log.debug(`Could not identify websocket device: ${e.stack}`);
            } finally {
                newDevice.stop();
            }

            //now use mac to check if we already now that device:
            const device = newDevice.mac ? this.adapter.devices.find(d => d.mac === newDevice.mac) : undefined;
            if (device) {
                this.adapter.log.debug(`Device was already present as ${device.model} on ${device.ip}`);
                if (device.ip === newDevice.ip && device.model !== newDevice.model) {
                    this.adapter.log.debug(`Model still differs? ${device.model} != ${newDevice.model}`);
                    if (model && device.isWebsocket) {
                        this.adapter.log.debug(`Updated model to ${model}`);
                        device.model = model;
                        await device.createDeviceObject(); //store new model in config.
                    }
                }
            } else {
                //not known yet, add to detected devices:
                this.detectedDevices[entry.ip] = {
                    ip: newDevice.ip,
                    name: entry.name,
                    type: model,
                    mac: newDevice.mac,
                    mydlink: true,
                    useWebSocket: true,
                    alreadyPresent: false,
                };
            }
        }

        if (entry.txt) {
            //build detected device and fill it:
            const device: DetectedDevice = this.detectedDevices[entry.ip] || {
                ip: entry.ip,
                name: entry.name,
            };

            for (const pair of entry.txt) {
                const [key, value] = pair.split('=');
                switch (key.toLowerCase()) {
                    //extract mac:
                    case 'mac': {
                        device.mac = normalizeMac(value);
                        break;
                    }
                    //extract model number (websocket devices use 'model'):
                    case 'model':
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
                    if (device.type && oldDevice.model !== device.type) {
                        oldDevice.model = device.type;
                    }
                    //found device we already know. Let's check ip.
                    if (device.ip !== oldDevice.ip) {
                        this.adapter.log.info(`${oldDevice.name} changed ip from ${oldDevice.ip} to ${device.ip}`);
                        oldDevice.ip = device.ip;
                        await oldDevice.createDeviceObject(); //store IP in config.
                        await oldDevice.start();
                    }
                    device.alreadyPresent = true;
                }
                this.adapter.log.debug(`Detected Device now is: ${JSON.stringify(device)}`);
            }
        }
    }

    /**
     * Close the mDNS listener.
     */
    close(): void {
        this.mdns.destroy();
    }

    /**
     * Constructor.
     *
     * @param adapter reference to the adapter
     */
    constructor(adapter: Mydlink) {
        this.adapter = adapter;
        //binds to 0.0.0.0:5353 and joins the multicast group on all interfaces.
        this.mdns = makeMdns();
        this.mdns.on('response', (packet, rinfo) => {
            this.onResponse(packet, rinfo).catch(e =>
                this.adapter.log.debug(`Error during processing of mDNS response: ${e.stack}`),
            );
        });
        this.mdns.on('error', e => this.adapter.log.warn(`Auto detection error: ${e.message}`));
        this.mdns.on('warning', e => this.adapter.log.debug(`Auto detection warning: ${e.message}`));
        this.mdns.on('ready', () => {
            this.adapter.log.debug('Auto detection started');
            this.query();
        });
    }
}

/**
 * Convert TXT record data (string, Buffer or array of those) to strings.
 *
 * @param data TXT record data
 * @returns array of key=value strings
 */
function txtToStrings(data: TxtData): string[] {
    const items = Array.isArray(data) ? data : [data];
    return items.map(item => (Buffer.isBuffer(item) ? item.toString() : String(item)));
}
