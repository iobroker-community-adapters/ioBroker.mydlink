import { expect } from 'chai';
import { legacyDecrypt, migrateLegacyDevices, sameTableDevices } from './Config';

const SECRET = 'a3f1c2d4e5b6a7980f1e2d3c4b5a69788796a5b4c3d2e1f0';

/**
 * Encrypts like the old admin page did (XOR with secret).
 *
 * @param key secret
 * @param value plain text
 */
function legacyEncrypt(key: string, value: string): string {
    let result = '';
    for (let i = 0; i < value.length; ++i) {
        result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
    }
    return result;
}

describe('Config', () => {
    describe('legacyDecrypt', () => {
        it('decrypts PINs encrypted by old versions', () => {
            expect(legacyDecrypt(SECRET, legacyEncrypt(SECRET, '123456'))).to.equal('123456');
        });

        it('keeps empty values', () => {
            expect(legacyDecrypt(SECRET, '')).to.equal('');
        });
    });

    describe('migrateLegacyDevices', () => {
        it('decrypts PINs of devices with MAC', () => {
            const [device] = migrateLegacyDevices(
                [{ ip: '192.168.0.10', mac: '18:0F:76:CC:6C:09', pin: legacyEncrypt(SECRET, '123456') }],
                SECRET,
            );
            expect(device.pin).to.equal('123456');
        });

        it('keeps PINs of devices without MAC, old versions stored them in plain text', () => {
            const [device] = migrateLegacyDevices([{ ip: '192.168.0.10', pin: '123456' }], SECRET);
            expect(device.pin).to.equal('123456');
        });

        it('keeps PINs marked as not encrypted and removes the marker', () => {
            const [device] = migrateLegacyDevices(
                [{ ip: '192.168.0.10', mac: '18:0F:76:CC:6C:09', pin: '123456', pinNotEncrypted: true }],
                SECRET,
            );
            expect(device.pin).to.equal('123456');
            expect(device).not.to.have.property('pinNotEncrypted');
        });

        it('does not change the given devices', () => {
            const encrypted = legacyEncrypt(SECRET, '123456');
            const devices = [{ ip: '192.168.0.10', mac: '18:0F:76:CC:6C:09', pin: encrypted }];
            migrateLegacyDevices(devices, SECRET);
            expect(devices[0].pin).to.equal(encrypted);
        });
    });

    describe('sameTableDevices', () => {
        const device = {
            name: 'Plug',
            mac: '18:0F:76:CC:6C:09',
            ip: '192.168.0.10',
            pin: '123456',
            pollInterval: 30000,
            enabled: true,
            model: 'DSP-W115',
            useWebSocket: true,
        };

        it('treats equal lists as same', () => {
            expect(sameTableDevices([device], [{ ...device }])).to.equal(true);
        });

        it('detects changed values', () => {
            expect(sameTableDevices([device], [{ ...device, ip: '192.168.0.11' }])).to.equal(false);
        });

        it('detects missing model, so it is stored once', () => {
            const { model: _model, ...withoutModel } = device;
            expect(sameTableDevices([device], [withoutModel])).to.equal(false);
        });

        it('treats missing and empty NTP server as same', () => {
            expect(sameTableDevices([device], [{ ...device, ntpServer: '' }])).to.equal(true);
        });

        it('detects changed NTP server', () => {
            expect(sameTableDevices([device], [{ ...device, ntpServer: '192.168.0.2' }])).to.equal(false);
        });

        it('treats poll interval as string and number as same', () => {
            expect(sameTableDevices([device], [{ ...device, pollInterval: '30000' as unknown as number }])).to.equal(
                true,
            );
        });
    });
});
