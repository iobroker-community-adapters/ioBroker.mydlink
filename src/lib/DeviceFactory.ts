
import { Mydlink } from './mydlink';
import {Device, processNetworkError, WrongMacError, WrongModelError} from './Device';
import { TableDevice } from './TableDevice';
import { KnownDevices } from './KnownDevices';
import {WebSocketDevice} from './WebSocketDevice';
import {SoapDevice} from './soapDevice';

function deviceObjetToTableDevice(configDevice: ioBroker.DeviceObject) : TableDevice {
    return {
        name: configDevice.native.name,
        mac: configDevice.native.mac,
        ip: configDevice.native.ip,
        pin: configDevice.native.pin,
        pollInterval: configDevice.native.pollInterval,
        enabled: configDevice.native.enabled,
    }
}
async function sendModelInfoToSentry(adapter : Mydlink, model : string, xmls: Record<string, string>) : Promise<void> {
    if (!KnownDevices[model]) {
        //unknown device -> report to sentry.
        adapter.log.info('Found new device, please report the following (full log from file, please) to developer: ' + JSON.stringify(xmls, null, 2));
        if (adapter.supportsFeature && adapter.supportsFeature('PLUGINS')) {
            const sentryInstance = adapter.getPluginInstance('sentry');
            if (sentryInstance) {
                const Sentry = sentryInstance.getSentryObject();
                if (Sentry) {
                    Sentry.withScope((scope : any) => {
                        scope.setLevel('info');
                        for (const key of Object.keys(xmls)) {
                            scope.setExtra(key, xmls[key]);
                        }
                        Sentry.captureMessage('Unknown-Device ' + model, 'info'); // Level 'info'
                    });
                }
            }
        }
    }
}

/**
 * Create DeviceInfo from ioBroker object, old createDeviceFromConfig (model known)
 * @param adapter ioBroker Adapter
 * @param configDevice ioBroker device object
 * @returns Promise<Device>
 */
export async function createFromObject(adapter : Mydlink, configDevice: ioBroker.DeviceObject) : Promise<Device> {
    const native = configDevice.native;
    const pinEncrypted = (native.mac && !native.pinNotEncrypted);
    if (native.model) {
        return createDevice(adapter, {
            ip: native.ip,
            pin: native.pin,
            pinEncrypted,
            model: native.model,
            pollInterval: native.pollInterval,
            mac: native.mac,
            id: configDevice._id.split('.')[2],
            name: native.name,
            enabled: native.enabled,
            isWebsocket: native.useWebsocket
        });
    } else {
        adapter.log.info(`Model still unknown for ${native.name}. Trying to identify.`);
        return createFromTable(adapter, deviceObjetToTableDevice(configDevice), pinEncrypted, native.useWebsocket);
    }
}

/**
 * Create a device with model known.
 * @param adapter
 * @param params
 */
export async function createDevice(adapter: Mydlink, params : {
    ip: string, pin: string, pinEncrypted: boolean, model: string,
    pollInterval?: number, mac?: string, id?: string,
    isWebsocket?: boolean, name?: string, enabled?: boolean}) : Promise<Device> {

    let device;
    const deviceFlags = KnownDevices[params.model];
    if (deviceFlags) {
        device = new deviceFlags.DeviceType(adapter, params.ip, params.pin, params.pinEncrypted);
    } else {
        adapter.log.info(`Unknown device type ${params.model} for ${params.name}.`);
        let info;
        if (params.isWebsocket) {
            device = new WebSocketDevice(adapter, params.ip, params.pin, params.pinEncrypted);
            info = {info: 'UNKNOWN WEBSOCKET DEVICE: ' + params.model};
        } else {
            device = new SoapDevice(adapter, params.ip, params.pin, params.pinEncrypted);
            info = await device.client.getDeviceDescriptionXML();
        }
        await sendModelInfoToSentry(adapter, params.model, info);
    }
    device.pollInterval = params.pollInterval || device.pollInterval;
    device.mac = params.mac || device.mac;
    device.id = params.id || device.id;
    if (!device.id) {
        device.idFromMac();
    }
    device.name = params.name || device.name;
    device.model = params.model;
    device.enabled = params.enabled !== undefined ? params.enabled : device.enabled;
    device.isWebsocket = params.isWebsocket !== undefined ? params.isWebsocket : device.isWebsocket;
    return device;
}

/**
 * Creates DeviceInfo from configuration-Table object (model unknown).
 * @param adapter ioBroker Adapter
 * @param tableDevice
 * @param [doDecrypt] do we need to decrypt the PIN?
 * @param [forceWebsocket] force usage of websocket device. Set to true, if soap already failed.
 * @returns @returns Promise<Device>
 */
export async function createFromTable(adapter : Mydlink, tableDevice: TableDevice, doDecrypt = false, forceWebsocket = false) : Promise<Device> {
    const pinEncrypted = (doDecrypt && Boolean(tableDevice.mac));
    const mac = tableDevice.mac ? tableDevice.mac.toUpperCase() : '';

    let device;
    //first try soap:
    if (!forceWebsocket) {
        device = new SoapDevice(adapter, tableDevice.ip, tableDevice.pin, pinEncrypted);
    } else {
        device = new WebSocketDevice(adapter, tableDevice.ip, tableDevice.pin, pinEncrypted);
    }

    device.mac = mac;
    device.pollInterval = tableDevice.pollInterval !== undefined && isFinite(Number(tableDevice.pollInterval)) && tableDevice.pollInterval >= 0 ? Number(tableDevice.pollInterval) : 30000;
    if (device.mac) {
        device.idFromMac();
    }
    device.name = tableDevice.name || device.name;
    device.enabled = tableDevice.enabled !== undefined ? tableDevice.enabled : device.enabled;

    try {
        await device.login();
        if (device.loggedIn) {
            //ok, login worked. -> seems to be soap device, identify:
            await device.identify();
        } else {
            if (!forceWebsocket) {
                adapter.log.debug(`${device.name} could not login with SOAP, try websocket.`);
                return createFromTable(adapter, tableDevice, doDecrypt, true);
            } else {
                throw new Error('Device not logged in... why?');
            }
        }
    } catch (e: any) {
        device.stop(); //stop old device in any case!
        const code = processNetworkError(e);
        if (!forceWebsocket && (code === 500 || code === 'ECONNREFUSED')) { //try websocket.
            return createFromTable(adapter, tableDevice, doDecrypt, true);
        }

        if (e.name === WrongModelError.errorName) {
            //model was wrong -> recreate with new model information.
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

        if (e.name === WrongMacError.errorName) {
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
                })
            }
        }

        adapter.log.debug('Login error: ' + e.stack);
        if (!device.loginErrorPrinted && e.code !== 'ETIMEDOUT' && e.code !== 'ECONNABORTED' && e.code !== 'ECONNRESET') {
            adapter.log.error(tableDevice.name + ' could not login. Please check credentials and if device is online/connected. Error: ' + e.code + ' - ' + e.stack);
            device.loginErrorPrinted = true;
        }

        device.loggedIn = false;
    }

    return device;
}
