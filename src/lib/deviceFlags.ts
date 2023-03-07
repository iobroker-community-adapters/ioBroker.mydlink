//state will be created if canSwitchOnOff: true or type includes 'detection'

export const DeviceFlags = {
    'DSP-W215': {
        type: 'Smart plug',
        canSwitchOnOff: true,
        hasTemp: true,
        hasPower: true,
        hasTotalPower: true,
        hasLastDetected: false
    },
    'DCH-S150': {
        type: 'Motion detection',
        canSwitchOnOff: false,
        hasTemp: false,
        hasPower: false,
        hasTotalPower: false,
        hasLastDetected: true
    },
    'DCH-S160': {
        type: 'Water detection',
        canSwitchOnOff: false,
        hasTemp: false,
        hasPower: false,
        hasTotalPower: false,
        hasLastDetected: true
    },
    'DSP-W115': {
        type: 'Smart plug',
        canSwitchOnOff: true,
        hasTemp: false,
        hasPower: false,
        hasTotalPower: false,
        hasLastDetected: false
    },
    'DSP-W118': {
        type: 'Smart plug',
        canSwitchOnOff: true,
        hasTemp: false,
        hasPower: false,
        hasTotalPower: false,
        hasLastDetected: false
    },
    'DSP-W245': {
        type: 'Smart plug',
        canSwitchOnOff: true,
        numSockets: 4,
        hasTemp: false,
        hasPower: false,
        hasTotalPower: false,
        hasLastDetected: false
    },
    'DCH-S220': {
        type: 'Sirene',
        canSwitchOnOff: false,
        hasTemp: false,
        hasPower: false,
        hasTotalPower: false,
        hasLastDetected: false
    }
};
