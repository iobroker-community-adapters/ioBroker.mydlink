import { expect } from 'chai';
import { join } from 'node:path';
import * as I18n from '@iobroker/adapter-core/i18n';
import { MydlinkDeviceManagement } from './DeviceManagement';
import type { Mydlink } from './mydlink';
import type { Device } from './Device';
import type { TableDevice } from './TableDevice';

/**
 * Creates a device like the adapter holds it.
 *
 * @param props properties of the device
 */
function createDevice(props: Partial<Device>): Device {
    return {
        name: 'Plug',
        mac: '18:0F:76:CC:6C:09',
        id: '180F76CC6C09',
        ip: '192.168.0.10',
        pin: '123456',
        pollInterval: 30000,
        enabled: true,
        model: 'DSP-W115',
        isWebsocket: true,
        loggedIn: true,
        ready: true,
        ...props,
    } as Device;
}

/**
 * Creates an adapter mock. Timeouts run immediately.
 *
 * @param devices devices of the adapter
 */
function createAdapter(devices: Device[]): {
    adapter: Mydlink;
    saved: TableDevice[][];
    deleted: Device[];
    identified: Device | undefined;
} {
    const result = {
        saved: [] as TableDevice[][],
        deleted: [] as Device[],
        identified: undefined as Device | undefined,
        adapter: undefined as unknown as Mydlink,
    };
    result.adapter = {
        namespace: 'mydlink.0',
        devices,
        log: { silly: () => {}, debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
        on: () => {},
        setTimeout: (callback: () => void) => {
            callback();
            return undefined;
        },
        clearTimeout: () => {},
        saveConfigDevices: (list: TableDevice[]) => {
            result.saved.push(list);
            return Promise.resolve();
        },
        deleteDeviceFull: (device: Device) => {
            result.deleted.push(device);
            return Promise.resolve();
        },
        identifyDevice: () => Promise.resolve(result.identified),
    } as unknown as Mydlink;
    return result;
}

/**
 * Creates an action context that answers forms with the given data.
 *
 * @param formData answer of showForm
 */
function createContext(formData?: Record<string, any>): { context: any; messages: any[] } {
    const messages: any[] = [];
    const context = {
        showMessage: (text: any) => {
            messages.push(text);
            return Promise.resolve();
        },
        showConfirmation: () => Promise.resolve(true),
        showForm: () => Promise.resolve(formData),
        openProgress: () => Promise.resolve({ update: async () => {}, close: async () => {} }),
    };
    return { context, messages };
}

describe('MydlinkDeviceManagement', () => {
    before(async () => {
        await I18n.init(join(__dirname, '..', '..', 'admin'), 'en');
    });

    it('lists devices with connection state', () => {
        const { adapter } = createAdapter([createDevice({}), createDevice({ mac: '', id: '', ip: '192.168.0.11' })]);
        const dm = new MydlinkDeviceManagement(adapter) as any;
        const added: any[] = [];
        dm.loadDevices({ addDevice: (d: any) => added.push(d), setTotalDevices: () => {} });

        expect(added.map(d => d.id)).to.deep.equal(['18:0F:76:CC:6C:09', '192.168.0.11']);
        expect(added[0].status.connection.stateId).to.equal('mydlink.0.180F76CC6C09.reachable');
        expect(added[0].icon).to.equal('socket');
        expect(added[1].status).to.equal('disconnected');
    });

    it('deletes device and stores configuration without it', async () => {
        const plug = createDevice({});
        const other = createDevice({ mac: 'AA:BB:CC:DD:EE:FF', id: 'AABBCCDDEEFF', ip: '192.168.0.12' });
        const { adapter, saved, deleted } = createAdapter([plug, other]);
        const dm = new MydlinkDeviceManagement(adapter) as any;

        await dm.deleteDevice('18:0F:76:CC:6C:09');

        expect(deleted).to.deep.equal([plug]);
        expect(adapter.devices).to.deep.equal([other]);
        expect(saved).to.have.length(1);
        expect(saved[0].map(d => d.mac)).to.deep.equal(['AA:BB:CC:DD:EE:FF']);
    });

    it('stores edited settings', async () => {
        const plug = createDevice({});
        const { adapter, saved } = createAdapter([plug]);
        const dm = new MydlinkDeviceManagement(adapter) as any;
        const { context } = createContext({ name: 'Lamp', ip: '192.168.0.20', pin: '654321', pollInterval: 0 });

        expect(await dm.editDevice('18:0F:76:CC:6C:09', context)).to.deep.equal({ refresh: 'devices' });

        expect(saved[0][0]).to.include({ name: 'Lamp', ip: '192.168.0.20', pin: '654321', pollInterval: 0 });
    });

    it('does not store edit without PIN', async () => {
        const { adapter, saved } = createAdapter([createDevice({})]);
        const dm = new MydlinkDeviceManagement(adapter) as any;
        const { context, messages } = createContext({ name: 'Lamp', ip: '192.168.0.20', pin: '' });

        await dm.editDevice('18:0F:76:CC:6C:09', context);

        expect(saved).to.have.length(0);
        expect(messages).to.have.length(1);
    });

    it('toggles enabled', () => {
        const { adapter, saved } = createAdapter([createDevice({})]);
        const dm = new MydlinkDeviceManagement(adapter) as any;

        dm.toggleEnabled('18:0F:76:CC:6C:09');

        expect(saved[0][0].enabled).to.equal(false);
    });

    it('adds identified device', async () => {
        const result = createAdapter([]);
        result.identified = createDevice({ name: '' });
        const dm = new MydlinkDeviceManagement(result.adapter) as any;
        const { context } = createContext({ ip: '192.168.0.10', pin: '123456', name: 'Kitchen' });

        expect(await dm.addDevice(context)).to.deep.equal({ refresh: true });

        expect(result.saved[0]).to.have.length(1);
        expect(result.saved[0][0]).to.include({ name: 'Kitchen', mac: '18:0F:76:CC:6C:09', pin: '123456' });
    });

    it('does not add a device twice', async () => {
        const result = createAdapter([createDevice({})]);
        result.identified = createDevice({ name: '' });
        const dm = new MydlinkDeviceManagement(result.adapter) as any;
        const { context, messages } = createContext({ ip: '192.168.0.10', pin: '123456', name: '' });

        expect(await dm.addDevice(context)).to.deep.equal({ refresh: false });

        expect(result.saved).to.have.length(0);
        expect(messages[0].en).to.equal('This device is already configured as Plug.');
    });

    it('reports failed identification', async () => {
        const result = createAdapter([]);
        const dm = new MydlinkDeviceManagement(result.adapter) as any;
        const { context, messages } = createContext({ ip: '192.168.0.10', pin: '123456', name: '' });

        expect(await dm.addDevice(context)).to.deep.equal({ refresh: false });

        expect(result.saved).to.have.length(0);
        expect(messages[0].en).to.include('192.168.0.10');
    });
});
