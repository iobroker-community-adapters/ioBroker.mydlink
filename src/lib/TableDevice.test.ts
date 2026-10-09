import { expect } from 'chai';
import { normalizeMac, sanitizeTableDevice } from './TableDevice';

describe('TableDevice => normalizeMac', () => {
    it('adds colons to MAC without separators (as announced by DSP-W115)', () => {
        expect(normalizeMac('180f76cc6c09')).to.equal('18:0F:76:CC:6C:09');
    });

    it('keeps MAC with colons, but upper case', () => {
        expect(normalizeMac('80:26:89:f0:53:e8')).to.equal('80:26:89:F0:53:E8');
    });

    it('replaces other separators', () => {
        expect(normalizeMac('80-26-89-F0-53-E8')).to.equal('80:26:89:F0:53:E8');
    });

    it('leaves invalid MAC unchanged except case', () => {
        expect(normalizeMac('abc')).to.equal('ABC');
    });
});

describe('TableDevice => sanitizeTableDevice', () => {
    it('normalizes MAC and reports change', () => {
        const device = { ip: '192.168.0.189', pin: '123456', mac: '180F76CC6C09' };
        expect(sanitizeTableDevice(device)).to.equal(true);
        expect(device.mac).to.equal('18:0F:76:CC:6C:09');
    });

    it('reports no change for normalized MAC', () => {
        const device = { ip: '192.168.0.191', pin: '123456', mac: '80:26:89:F0:53:E8' };
        expect(sanitizeTableDevice(device)).to.equal(false);
    });

    it('reports no change for device without MAC', () => {
        const device = { ip: '192.168.0.191', pin: '123456' };
        expect(sanitizeTableDevice(device)).to.equal(false);
    });
});
