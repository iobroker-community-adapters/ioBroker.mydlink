import type { Mydlink } from './mydlink';
import type { Device } from './Device';
import { processNetworkError, WrongMacError, WrongModelError } from './Device';
import type { TableDevice } from './TableDevice';
import { KnownDevices } from './KnownDevices';
import { WebSocketDevice } from './WebSocketDevice';
import { SoapDevice } from './soapDevice';

function sendModelInfoToSentry(adapter: Mydlink, model: string, xml: Record<string, string>): void {
    if (!KnownDevices[model]) {
        //unknown device -> report to sentry.
        adapter.log.info(
            `Found new device, please report the following (full log from file, please) to developer: ${JSON.stringify(
                xml,
                null,
                2,
            )}`,
        );
        if (adapter.supportsFeature && adapter.supportsFeature('PLUGINS')) {
            const sentryInstance = adapter.getPluginInstance('sentry');
            if (sentryInstance) {
                const Sentry = sentryInstance.getSentryObject();
                if (Sentry) {
                    Sentry.withScope((scope: any) => {
                        scope.setLevel('info');
                        for (const key of Object.keys(xml)) {
                            scope.setExtra(key, xml[key]);
                        }
                        Sentry.captureMessage(`Unknown-Device ${model}`, 'info'); // Level 'info'
                    });
                }
            }
        }
    }
}

/**
 * Create a device with model known.
 *
 * @param adapter reference to the running adapter
 * @param params parameters for device creation
 * @param params.ip ip of device
 * @param params.pin pin of device
 * @param params.model model of device
 * @param params.pollInterval polling interval
 * @param params.mac mac address
 * @param params.id id of device
 * @param params.isWebsocket use websocket device?
 * @param params.name name of device
 * @param params.enabled is device enabled?
 */
export async function createDevice(
    adapter: Mydlink,
    params: {
        ip: string;
        pin: string;
        model: string;
        pollInterval?: number;
        mac?: string;
        id?: string;
        isWebsocket?: boolean;
        name?: string;
        enabled?: boolean;
    },
): Promise<Device | undefined> {
    const deviceFlags = KnownDevices[params.model];
    let device: SoapDevice | WebSocketDevice;
    if (deviceFlags) {
        device = new deviceFlags.DeviceType(adapter, params.ip, params.pin);
        if (typeof deviceFlags.moreSetup === 'function') {
            deviceFlags.moreSetup(device);
        }
    } else {
        adapter.log.info(`Unknown device type ${params.model} for ${params.name}.`);
        try {
            let info: Record<string, string>;
            if (params.isWebsocket) {
                device = new WebSocketDevice(adapter, params.ip, params.pin);
                const body = await device.getModelInfoForSentry();
                info = { info: `UNKNOWN WEBSOCKET DEVICE: ${params.model}`, body };
            } else {
                device = new SoapDevice(adapter, params.ip, params.pin);
                info = await device.client.getDeviceDescriptionXML();
            }
            sendModelInfoToSentry(adapter, params.model, info);
        } catch (e: any) {
            adapter.log.error(`Could not send device information to sentry. Please report. Error was: ${e.stack}`);
            return undefined;
        }
    }

    if (device !== undefined) {
        device.pollInterval = Number.isFinite(params.pollInterval) ? Number(params.pollInterval) : device.pollInterval;
        device.mac = params.mac || device.mac;
        device.id = params.id || device.id;
        if (!device.id) {
            device.idFromMac();
        }
        device.name = params.name || device.name;
        device.model = params.model;
        device.enabled = params.enabled !== undefined ? params.enabled : device.enabled;
        device.isWebsocket = params.isWebsocket !== undefined ? params.isWebsocket : device.isWebsocket;
    }
    return device;
}

/**
 * Creates DeviceInfo from configuration-Table object (model unknown).
 *
 * @param adapter ioBroker Adapter
 * @param tableDevice device information from configuration table
 * @param [forceWebsocket] force usage of websocket device. Set to true, if soap already failed.
 * @returns Promise<Device>
 */
export async function createFromTable(
    adapter: Mydlink,
    tableDevice: TableDevice,
    forceWebsocket = false,
): Promise<Device | undefined> {
    const mac = tableDevice.mac ? tableDevice.mac.toUpperCase() : '';

    let device: SoapDevice | WebSocketDevice;
    //first try soap:
    if (!forceWebsocket) {
        device = new SoapDevice(adapter, tableDevice.ip, tableDevice.pin);
    } else {
        device = new WebSocketDevice(adapter, tableDevice.ip, tableDevice.pin);
    }

    device.mac = mac;
    device.pollInterval =
        tableDevice.pollInterval !== undefined &&
        isFinite(Number(tableDevice.pollInterval)) &&
        tableDevice.pollInterval >= 0
            ? Number(tableDevice.pollInterval)
            : 30000;
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
                return createFromTable(adapter, tableDevice, true);
            }
            throw new Error('Device not logged in... why?');
        }
    } catch (e: any) {
        device.stop(); //stop old device in any case!
        const code = processNetworkError(e);
        if (!forceWebsocket && (code === 500 || code === 'ECONNREFUSED')) {
            //try websocket.
            return createFromTable(adapter, tableDevice, true);
        }

        if (e.name === WrongModelError.errorName) {
            //model was wrong -> recreate with new model information.
            adapter.log.debug(`Found ${device.model} for ${device.name}. Create a fitting device.`);
            return createDevice(adapter, {
                model: device.model,
                ip: device.ip,
                pin: device.pin,
                name: device.name,
                mac: device.mac,
                pollInterval: device.pollInterval,
                id: device.id,
                isWebsocket: device.isWebsocket,
                enabled: device.enabled,
            });
        }

        if (e.name === WrongMacError.errorName) {
            adapter.log.info(
                `Device with unexpected MAC ${device.mac} reacted on ${device.ip}. Trying to create new device object for it.`,
            );
            if (device.model) {
                return createDevice(adapter, {
                    model: device.model,
                    ip: device.ip,
                    pin: device.pin,
                    name: device.name,
                    mac: device.mac,
                    pollInterval: device.pollInterval,
                    id: device.id,
                    isWebsocket: device.isWebsocket,
                    enabled: device.enabled,
                });
            }
            return createFromTable(adapter, {
                mac: device.mac,
                ip: device.ip,
                pin: device.pin,
                name: device.name,
                pollInterval: device.pollInterval,
                enabled: device.enabled,
            });
        }

        adapter.log.debug(`Login error: ${e.stack}`);
        if (
            !device.loginErrorPrinted &&
            e.code !== 'ETIMEDOUT' &&
            e.code !== 'ECONNABORTED' &&
            e.code !== 'ECONNRESET'
        ) {
            adapter.log.error(
                `${
                    tableDevice.name || tableDevice.ip
                } could not login. Please check credentials and if device is online/connected. Error: ${e.code} - ${
                    e.stack
                }`,
            );
            device.loginErrorPrinted = true;
        }

        device.loggedIn = false;
    }

    return device;
}
