import * as I18n from '@iobroker/adapter-core/i18n';
import { ACTIONS, DeviceManagement } from '@iobroker/dm-utils';
import type {
    ActionContext,
    DeviceDetails,
    DeviceInfo as DmDeviceInfo,
    DeviceLoadContext,
    DeviceRefreshResponse,
    InstanceDetails,
    InstanceRefreshResponse,
    JsonFormSchema,
    ConfigItemStaticInfo,
} from '@iobroker/dm-utils';
import type { Mydlink } from './mydlink';
import type { Device } from './Device';
import { KnownDevices } from './KnownDevices';
import { Suffixes } from './suffixes';
import { deviceToTableDevice } from './Config';

/**
 * Time to wait before the configuration is saved. Saving restarts the adapter, so the answer to the GUI has to be sent
 * before.
 */
const SAVE_DELAY = 1000;

/**
 * Size of form items: dialogs show one item per row on all screen sizes.
 */
const FULL_WIDTH = { xs: 12, sm: 12, md: 12, lg: 12, xl: 12 } as const;

/**
 * Icons of the device manager for the types of KnownDevices.
 */
const TYPE_ICONS: Record<string, string> = {
    'Smart plug': 'socket',
    'Motion detection': 'motion',
    Sirene: 'warning',
};

/**
 * Translates a text of admin/i18n.
 *
 * @param key key of the text
 * @param args replacements for %s
 * @returns text in all languages
 */
function t(key: string, ...args: (string | number | boolean | null)[]): ioBroker.Translated {
    return I18n.getTranslatedObject(key, ...args);
}

/**
 * Id of a device in the device manager. Devices that were never identified have no MAC, yet.
 *
 * @param device the device
 * @returns MAC or IP of the device
 */
function deviceKey(device: Device): string {
    return device.mac || device.ip;
}

/**
 * Device manager support: add, edit, enable / disable and delete devices.
 * All changes are stored in the instance configuration, which restarts the adapter.
 */
export class MydlinkDeviceManagement extends DeviceManagement<Mydlink> {
    private saveTimeout: ioBroker.Timeout | undefined;

    /**
     * Returns information and actions of the instance.
     */
    protected getInstanceInfo(): InstanceDetails {
        return {
            apiVersion: 'v3',
            identifierLabel: t('ipaddress'),
            actions: [
                {
                    id: 'search',
                    icon: 'search',
                    title: t('dmSearchDevices'),
                    description: t('dmSearchDevicesDescription'),
                    handler: context => this.searchDevices(context),
                },
                {
                    id: 'add',
                    icon: 'add',
                    title: t('dmAddDevice'),
                    description: t('dmAddDeviceDescription'),
                    handler: context => this.addDevice(context),
                },
            ],
        };
    }

    /**
     * Fills the device list of the GUI.
     *
     * @param context load context
     */
    protected loadDevices(context: DeviceLoadContext<string>): void {
        context.setTotalDevices(this.adapter.devices.length);
        for (const device of this.adapter.devices) {
            context.addDevice(this.getDmDeviceInfo(device));
        }
    }

    /**
     * Returns details of a device.
     *
     * @param id id of the device in the device manager
     */
    protected getDeviceDetails(id: string): DeviceDetails<string> | { error: string } {
        const device = this.findDevice(id);
        if (!device) {
            return { error: `Unknown device ${id}` };
        }
        const info = (label: string, data: string | number | boolean): ConfigItemStaticInfo => ({
            type: 'staticInfo',
            label: t(label),
            data,
            booleanAsCheckbox: true,
            ...FULL_WIDTH,
        });
        const schema: JsonFormSchema = {
            type: 'panel',
            items: {
                model: info('model', device.model),
                mac: info('mac', device.mac),
                ip: info('ipaddress', device.ip),
                protocol: info('dmProtocol', device.isWebsocket ? 'WebSocket' : 'HNAP'),
                pollInterval: info('pollInterval', device.pollInterval),
                loggedIn: info('dmLoggedIn', device.loggedIn),
                ready: info('dmReady', device.ready),
            },
        };
        return { id, schema };
    }

    /**
     * Creates the device manager information of a device.
     *
     * @param device the device
     * @returns device information for the GUI
     */
    private getDmDeviceInfo(device: Device): DmDeviceInfo<string> {
        const type = KnownDevices[device.model]?.type;
        return {
            id: deviceKey(device),
            identifier: device.ip,
            name: device.name || device.model || device.ip,
            icon: TYPE_ICONS[type],
            manufacturer: 'D-Link',
            model: device.model,
            connectionType: 'wifi',
            enabled: device.enabled,
            status: device.id
                ? {
                      connection: {
                          stateId: `${this.adapter.namespace}.${device.id}${Suffixes.reachable}`,
                          mapping: { true: 'connected', false: 'disconnected' },
                      },
                  }
                : 'disconnected',
            hasDetails: true,
            actions: [
                {
                    id: 'edit',
                    icon: 'edit',
                    description: t('dmEditDevice'),
                    handler: (id, context) => this.editDevice(id, context),
                },
                {
                    id: ACTIONS.ENABLE_DISABLE,
                    handler: id => this.toggleEnabled(id),
                },
                {
                    id: 'delete',
                    icon: 'delete',
                    description: t('dmDeleteDevice'),
                    confirmation: t('dmDeleteConfirm', device.name || device.ip),
                    handler: id => this.deleteDevice(id),
                },
            ],
        };
    }

    /**
     * Finds a running device by its device manager id.
     *
     * @param id id of the device in the device manager
     * @returns the device or undefined
     */
    private findDevice(id: string): Device | undefined {
        return this.adapter.devices.find(device => deviceKey(device) === id);
    }

    /**
     * Stores the devices in the configuration after the answer was sent to the GUI. The adapter restarts then.
     * Several changes in a short time are stored together.
     */
    private scheduleSave(): void {
        if (this.saveTimeout) {
            this.adapter.clearTimeout(this.saveTimeout);
        }
        this.saveTimeout = this.adapter.setTimeout(() => {
            this.saveTimeout = undefined;
            this.adapter.log.info('Device configuration changed in device manager. Adapter will restart.');
            this.adapter
                .saveConfigDevices(this.adapter.devices.map(deviceToTableDevice))
                .catch(e => this.adapter.log.error(`Could not save configuration: ${e}`));
        }, SAVE_DELAY);
    }

    /**
     * Instance action: offers the detected devices, that are not configured, yet.
     *
     * @param context action context
     */
    private async searchDevices(context: ActionContext): Promise<InstanceRefreshResponse> {
        const autoDetector = this.adapter.autoDetector;
        //query network again for the next search.
        autoDetector?.refresh();
        const detected = Object.values(autoDetector?.detectedDevices || {}).filter(
            d => d.mac && !this.adapter.devices.some(device => device.mac === d.mac),
        );
        if (!detected.length) {
            await context.showMessage(t('dmNoDevicesDetected'));
            return { refresh: false };
        }
        return this.addDevice(
            context,
            detected.map(d => ({ label: `${d.type || '?'} - ${d.mac} (${d.ip})`, value: d.ip })),
        );
    }

    /**
     * Instance action: asks for IP and PIN, identifies the device and adds it.
     *
     * @param context action context
     * @param detected detected devices to select from. If not given, the IP is entered.
     */
    private async addDevice(
        context: ActionContext,
        detected?: { label: string; value: string }[],
    ): Promise<InstanceRefreshResponse> {
        const schema: JsonFormSchema = {
            type: 'panel',
            items: {
                ip: detected
                    ? { type: 'select', label: t('dmDetectedDevice'), options: detected, ...FULL_WIDTH }
                    : { type: 'text', label: t('ipaddress'), ...FULL_WIDTH },
                pin: { type: 'password', label: t('pin'), visible: true, ...FULL_WIDTH },
                name: { type: 'text', label: t('name'), ...FULL_WIDTH },
            },
        };
        const data = await context.showForm(schema, {
            data: { ip: detected ? detected[0].value : '', pin: '', name: '' },
            title: detected ? t('dmSearchDevices') : t('dmAddDevice'),
        });
        if (!data) {
            return { refresh: false };
        }
        const ip = String(data.ip ?? '').trim();
        const pin = String(data.pin ?? '').trim();
        if (!ip || !pin) {
            await context.showMessage(t('dmErrorMissingIpOrPin'));
            return { refresh: false };
        }

        const progress = await context.openProgress(t('dmIdentifying'), { indeterminate: true });
        let device: Device | undefined;
        try {
            device = await this.adapter.identifyDevice(ip, pin);
        } finally {
            await progress.close();
        }
        if (!device) {
            await context.showMessage(t('dmErrorIdentify', ip));
            return { refresh: false };
        }
        const mac = device.mac;
        const existing = this.adapter.devices.find(d => d.mac === mac);
        if (existing) {
            await context.showMessage(t('dmErrorDuplicate', existing.name || mac));
            return { refresh: false };
        }

        const name = String(data.name ?? '').trim();
        if (name) {
            device.name = name;
        }
        this.adapter.devices.push(device);
        this.scheduleSave();
        await context.showMessage(t('dmDeviceAdded', device.name || device.model));
        return { refresh: true };
    }

    /**
     * Device action: change name, IP, PIN and polling interval.
     *
     * @param id id of the device in the device manager
     * @param context action context
     */
    private async editDevice(id: string, context: ActionContext): Promise<DeviceRefreshResponse<string>> {
        const device = this.findDevice(id);
        if (!device) {
            return { refresh: 'devices' };
        }
        const schema: JsonFormSchema = {
            type: 'panel',
            items: {
                name: { type: 'text', label: t('name'), ...FULL_WIDTH },
                ip: { type: 'text', label: t('ipaddress'), ...FULL_WIDTH },
                pin: { type: 'password', label: t('pin'), visible: true, ...FULL_WIDTH },
                pollInterval: { type: 'number', label: t('pollInterval'), min: 0, unit: 'ms', ...FULL_WIDTH },
            },
        };
        //only HNAP devices allow to set the NTP server:
        if (!device.isWebsocket) {
            schema.items.ntpServer = { type: 'text', label: t('ntpServer'), help: t('ntpServerHelp'), ...FULL_WIDTH };
        }
        const data = await context.showForm(schema, {
            data: {
                name: device.name,
                ip: device.ip,
                pin: device.pin,
                pollInterval: device.pollInterval,
                ntpServer: device.ntpServer,
            },
            title: t('dmEditDevice'),
        });
        if (!data) {
            return { refresh: 'none' };
        }
        const ip = String(data.ip ?? '').trim();
        const pin = String(data.pin ?? '').trim();
        if (!ip || !pin) {
            await context.showMessage(t('dmErrorMissingIpOrPin'));
            return { refresh: 'none' };
        }
        const pollInterval = Number(data.pollInterval);

        device.name = String(data.name ?? '').trim();
        device.ip = ip;
        device.pin = pin;
        device.pollInterval = Number.isFinite(pollInterval) && pollInterval >= 0 ? pollInterval : device.pollInterval;
        if (!device.isWebsocket) {
            device.ntpServer = String(data.ntpServer ?? '').trim();
        }
        this.scheduleSave();
        return { refresh: 'devices' };
    }

    /**
     * Device action: enable or disable a device.
     *
     * @param id id of the device in the device manager
     */
    private toggleEnabled(id: string): DeviceRefreshResponse<string> {
        const device = this.findDevice(id);
        if (device) {
            device.enabled = !device.enabled;
            this.scheduleSave();
        }
        return { refresh: 'devices' };
    }

    /**
     * Device action: delete a device and its objects. The GUI asked for confirmation already.
     *
     * @param id id of the device in the device manager
     */
    private async deleteDevice(id: string): Promise<DeviceRefreshResponse<string>> {
        const device = this.findDevice(id);
        if (device) {
            this.adapter.devices.splice(this.adapter.devices.indexOf(device), 1);
            await this.adapter.deleteDeviceFull(device);
            this.scheduleSave();
        }
        return { refresh: 'devices' };
    }
}
