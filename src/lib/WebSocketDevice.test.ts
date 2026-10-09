import { expect } from 'chai';
import { WebSocketDevice } from './WebSocketDevice';
import type { Mydlink } from './mydlink';

/**
 * Creates an adapter mock, that records warnings.
 */
function createAdapter(): { adapter: Mydlink; warnings: string[] } {
    const warnings: string[] = [];
    const adapter = {
        unloading: false,
        log: {
            silly: () => {},
            debug: () => {},
            info: () => {},
            warn: (message: string) => warnings.push(message),
            error: () => {},
        },
        setStateChangedAsync: async () => {},
        setStateAsync: async () => {},
        setState: async () => {},
        setTimeout: () => undefined,
        clearTimeout: () => {},
    } as unknown as Mydlink;
    return { adapter, warnings };
}

/**
 * Creates a websocket device with a fake client.
 *
 * @param client fake client methods
 */
function createDevice(client: Record<string, any>): { device: WebSocketDevice; warnings: string[] } {
    const { adapter, warnings } = createAdapter();
    const device = new WebSocketDevice(adapter, '192.168.0.189', '123456', false);
    device.client = { disconnect: () => {}, removeAllListeners: () => {}, ...client } as any;
    device.name = 'W115';
    device.id = '180F76CC6C09';
    device.model = 'DSP-W115';
    return { device, warnings };
}

/**
 * Error like the client reports it.
 *
 * @param code code of the error
 */
function apiError(code: number): Error {
    return Object.assign(new Error(`API Error ${code}`), { code });
}

describe('WebSocketDevice => login lock', () => {
    it('pauses login if device refuses sign in with code 34', async () => {
        let logins = 0;
        const { device, warnings } = createDevice({
            login: () => {
                logins += 1;
                return Promise.reject(apiError(34));
            },
        });

        expect(await device.login()).to.equal(false);
        expect(warnings).to.have.length(1);
        expect(device.loginBlockedUntil).to.be.greaterThan(Date.now());

        expect(await device.login()).to.equal(false);
        expect(logins).to.equal(1);
    });

    it('pauses login after 3 invalid device tokens in a row', async () => {
        let logins = 0;
        const { device, warnings } = createDevice({
            login: () => {
                logins += 1;
                return Promise.resolve(true);
            },
            isDeviceReady: () => true,
            state: () => Promise.reject(apiError(403)),
        });
        device.identified = true;

        for (let i = 0; i < 3; i += 1) {
            device.ready = true;
            await device.onInterval();
        }
        expect(warnings).to.have.length(1);
        expect(device.loginBlockedUntil).to.be.greaterThan(Date.now());

        const loginsBefore = logins;
        await device.onInterval();
        expect(logins).to.equal(loginsBefore);
    });

    it('resets invalid device token count after successful request', async () => {
        let fail = true;
        const { device, warnings } = createDevice({
            login: () => Promise.resolve(true),
            isDeviceReady: () => true,
            state: () => (fail ? Promise.reject(apiError(403)) : Promise.resolve(true)),
        });
        device.identified = true;

        for (const result of [true, true, false, true, true]) {
            fail = result;
            device.ready = true;
            await device.onInterval();
        }
        expect(device.invalidTokens).to.equal(2);
        expect(warnings).to.have.length(0);
        expect(device.loginBlockedUntil).to.equal(0);
    });
});
