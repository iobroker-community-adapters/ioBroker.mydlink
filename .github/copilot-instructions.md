# ioBroker Adapter Development with GitHub Copilot

**Version:** 0.4.0
**Template Source:** https://github.com/DrozmotiX/ioBroker-Copilot-Instructions

This file contains instructions and best practices for GitHub Copilot when working on ioBroker adapter development.

## Project Context

You are working on an ioBroker adapter. ioBroker is an integration platform for the Internet of Things, focused on building smart home and industrial IoT solutions. Adapters are plugins that connect ioBroker to external systems, devices, or services.

**ioBroker.mydlink Adapter**: This adapter integrates D-Link mydlink smart home devices with ioBroker. It supports:

- **Smart Plugs**: DSP-W215 (socket, temperature, current monitoring), DSP-W115 (basic socket control)
- **Motion Detectors**: DCH-S150 (motion detection with polling)
- **Communication Protocols**: HTTP/SOAP for older devices, WebSocket for newer devices
- **Device Discovery**: Automatic network detection using mDNS
- **Authentication**: PIN-based device authentication (printed on device labels)
- **Power Monitoring**: Real-time power consumption and temperature readings
- **State Management**: Device on/off control, motion detection status
- **Polling Configuration**: Configurable poll intervals per device (0 = push notifications where supported)

Key technical aspects:
- Uses both SOAP and WebSocket client libraries for device communication
- Implements device auto-detection with manual configuration fallback
- Handles device-specific PIN authentication and encryption
- Supports both polling and push notification patterns depending on device capabilities
- Provides comprehensive error handling for network timeouts and device unavailability

## Testing

### Unit Testing
- Use Jest as the primary testing framework for ioBroker adapters
- Create tests for all adapter main functions and helper methods
- Test error handling scenarios and edge cases
- Mock external API calls and hardware dependencies
- For adapters connecting to APIs/devices not reachable by internet, provide example data files to allow testing of functionality without live connections
- Example test structure:
  ```javascript
  describe('AdapterName', () => {
    let adapter;
    
    beforeEach(() => {
      // Setup test adapter instance
    });
    
    test('should initialize correctly', () => {
      // Test adapter initialization
    });
  });
  ```

### Integration Testing

**IMPORTANT**: Use the official `@iobroker/testing` framework for all integration tests. This is the ONLY correct way to test ioBroker adapters.

**Official Documentation**: https://github.com/ioBroker/testing

#### Framework Structure
Integration tests MUST follow this exact pattern:

```javascript
const path = require('path');
const { tests } = require('@iobroker/testing');

// Define test coordinates or configuration
const TEST_COORDINATES = '52.520008,13.404954'; // Berlin

// Use tests.integration() with defineAdditionalTests
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Test adapter with specific configuration', (getHarness) => {
            let harness;

            before(() => {
                harness = getHarness();
            });

            it('should configure and start adapter', () => new Promise(async (resolve) => {
                // Get adapter object and configure
                harness.objects.getObject('system.adapter.brightsky.0', async (err, obj) => {
                    if (err) {
                        console.error('Error getting adapter object:', err);
                        return resolve();
                    }

                    obj.native.longitude = TEST_COORDINATES.split(',')[1];
                    obj.native.latitude = TEST_COORDINATES.split(',')[0];

                    harness.objects.setObject('system.adapter.brightsky.0', obj, (err) => {
                        if (err) {
                            console.error('Error setting adapter object:', err);
                            return resolve();
                        }

                        harness.startAdapter();
                        setTimeout(() => {
                            // Adapter should be running and have created objects
                            harness.states.getState('brightsky.0.info.connection', (err, state) => {
                                console.log('Connection state:', state);
                                harness.stopAdapter();
                                resolve();
                            });
                        }, 5000);
                    });
                });
            }));
        });
    }
});
```

#### Required Test Files
1. **test/integration.js** - Main integration tests
2. **test/package.js** - Package validation tests

#### Integration Testing for mydlink Adapter

For the mydlink adapter, create specific tests for:
- Device discovery and connection
- SOAP/WebSocket communication patterns
- PIN authentication flows
- Device state synchronization
- Error handling for unreachable devices
- Mock D-Link device responses using example XML/JSON data

Example test scenarios:
```javascript
// Test device discovery
suite('Device Discovery Tests', (getHarness) => {
    it('should discover devices on network', async () => {
        // Mock mDNS discovery responses
        const mockDevices = [
            { ip: '192.168.1.100', mac: '00:11:22:33:44:55', model: 'DSP-W215' }
        ];
        // Test auto-detection functionality
    });
});

// Test device communication
suite('Device Communication Tests', (getHarness) => {
    it('should authenticate with device PIN', async () => {
        // Mock SOAP authentication response
        // Test PIN-based authentication
    });
    
    it('should handle device polling correctly', async () => {
        // Test poll interval configuration
        // Mock device state responses
    });
});
```

#### Common Testing Patterns
```javascript
// Simulate adapter lifecycle
before(() => {
    harness = getHarness();
});

after(() => {
    if (harness) harness.stopAdapter();
});

// Test object creation
it('should create device objects', () => new Promise((resolve) => {
    harness.on('objectChange', (id, obj) => {
        if (id.endsWith('.info.connection')) {
            expect(obj).to.have.property('common');
            resolve();
        }
    });
}));

// Test state changes
it('should update device states', () => new Promise((resolve) => {
    harness.on('stateChange', (id, state) => {
        if (id.endsWith('.switch')) {
            expect(state.val).to.be.a('boolean');
            resolve();
        }
    });
}));
```

### Test Execution
```bash
# Run all tests
npm test

# Run only integration tests  
npm run test:integration

# Run only package tests
npm run test:package
```

## File Structure and Architecture

### Standard ioBroker Adapter Structure
```
/
├── admin/                  # Admin interface files
│   ├── index_m.html       # Main admin page
│   ├── words.js          # Translations
│   └── mydlink.png       # Adapter icon
├── lib/                   # Compiled JavaScript (from TypeScript)
├── src/                   # TypeScript source code
│   ├── main.ts           # Main adapter file
│   ├── lib/              # Helper libraries
│   └── main.test.ts      # Unit tests
├── test/                  # Integration tests
├── docs/                  # Documentation
├── io-package.json        # Adapter configuration
├── package.json          # Node.js package info
└── README.md             # Documentation
```

### mydlink-Specific Architecture
```
src/
├── main.ts                # Main adapter class (Mydlink extends utils.Adapter)
├── lib/
│   ├── Device.ts          # Base device class
│   ├── DeviceInfo.ts      # Device information and encryption handling
│   ├── DeviceFactory.ts   # Device creation factory
│   ├── TableDevice.ts     # Configuration table device structure
│   ├── soapDevice.ts      # SOAP-based device communication
│   ├── WebSocketDevice.ts # WebSocket-based device communication
│   ├── soapclient.ts      # SOAP client implementation
│   ├── autoDetect.ts      # Device auto-discovery
│   ├── KnownDevices.ts    # Device model definitions
│   └── suffixes.ts        # Device state suffixes
```

Key design patterns:
- **Factory Pattern**: DeviceFactory creates appropriate device instances based on model
- **Strategy Pattern**: Different communication strategies (SOAP vs WebSocket) for different device types
- **Observer Pattern**: Device state changes trigger ioBroker state updates
- **Configuration Management**: Device settings stored in adapter configuration with PIN encryption

## Code Patterns and Best Practices

### Standard ioBroker Adapter Patterns

#### Main Adapter Class Structure
```typescript
import * as utils from '@iobroker/adapter-core';

class AdapterName extends utils.Adapter {
    constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'adapter-name',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    private async onReady(): Promise<void> {
        // Initialize adapter
        this.setState('info.connection', false, true);
    }

    private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
        if (!state) return;
        // Handle state changes
    }

    private onUnload(callback: () => void): void {
        // Cleanup
        callback();
    }
}
```

#### Object Creation Patterns
```typescript
// Create channel for device
await this.setObjectNotExistsAsync('device.channel', {
    type: 'channel',
    common: {
        name: 'Device Channel',
    },
    native: {},
});

// Create state for value
await this.setObjectNotExistsAsync('device.channel.state', {
    type: 'state',
    common: {
        name: 'State Name',
        type: 'boolean',
        role: 'switch',
        read: true,
        write: true,
    },
    native: {},
});
```

#### State Management
```typescript
// Set state with acknowledgment
await this.setStateAsync('device.state', true, true);

// Set state without acknowledgment (user change)
await this.setStateAsync('device.state', false, false);

// Get state value
const state = await this.getStateAsync('device.state');
if (state) {
    const value = state.val;
}
```

#### Error Handling
```typescript
try {
    // Risky operation
    await this.someAsyncOperation();
} catch (error) {
    this.log.error(`Operation failed: ${error.message}`);
    this.setState('info.connection', false, true);
}
```

### mydlink Adapter Specific Patterns

#### Device Discovery and Management
```typescript
// Auto-detection with mDNS
this.autoDetector = new AutoDetector(this);

// Device factory usage
const device = createFromTable(sanitizeTableDevice(configDevice), this);
if (device) {
    this.devices.push(device);
    await device.init();
}

// Device polling management
if (device.pollInterval > 0) {
    this.devices.push(device);
} else {
    // Use push notifications for supported devices
    device.enablePushNotifications();
}
```

#### SOAP Communication Patterns
```typescript
// SOAP device authentication
const soapClient = new SOAPClient(deviceIP);
const authResult = await soapClient.authenticate(devicePIN);
if (authResult.success) {
    const deviceInfo = await soapClient.getDeviceInfo();
    this.updateDeviceStates(deviceInfo);
}

// Handle SOAP errors
try {
    const response = await soapClient.request(action, body);
    return this.parseSOAPResponse(response);
} catch (error) {
    this.log.warn(`SOAP request failed for ${this.ip}: ${error.message}`);
    this.adapter.setState(`${this.name}.info.connection`, false, true);
}
```

#### WebSocket Communication Patterns
```typescript
// WebSocket device connection
const wsDevice = new WebSocketDevice(deviceIP, devicePIN, this);
wsDevice.on('connected', () => {
    this.setState(`${device.name}.info.connection`, true, true);
});

wsDevice.on('stateChange', (stateName, value) => {
    this.setState(`${device.name}.${stateName}`, value, true);
});

wsDevice.on('error', (error) => {
    this.log.error(`WebSocket error for ${device.name}: ${error.message}`);
});
```

#### Device Configuration and PIN Handling
```typescript
// PIN encryption/decryption
const systemConfig = await this.getForeignObjectAsync('system.config');
const secret = systemConfig?.native?.secret || 'defaultSecret';
DeviceInfo.setSecret(secret);

// Device configuration validation
const configDevice: TableDevice = {
    name: device.name,
    ip: device.ip,
    pin: DeviceInfo.encrypt(device.pin), // Store encrypted
    pollInterval: device.pollInterval || 10000,
    enabled: device.enabled !== false
};

// Decrypt PIN for device communication
const decryptedPIN = DeviceInfo.decrypt(configDevice.pin);
```

#### Power Monitoring Patterns (DSP-W215)
```typescript
// Power consumption states
await this.setObjectNotExistsAsync(`${deviceName}.power`, {
    type: 'state',
    common: {
        name: 'Current Power',
        type: 'number',
        role: 'value.power',
        unit: 'W',
        read: true,
        write: false,
    },
    native: {},
});

// Temperature monitoring
await this.setObjectNotExistsAsync(`${deviceName}.temperature`, {
    type: 'state',
    common: {
        name: 'Temperature',
        type: 'number',
        role: 'value.temperature',
        unit: '°C',
        read: true,
        write: false,
    },
    native: {},
});
```

#### Motion Detection Patterns (DCH-S150)
```typescript
// Motion state handling
await this.setObjectNotExistsAsync(`${deviceName}.motion`, {
    type: 'state',
    common: {
        name: 'Motion Detected',
        type: 'boolean',
        role: 'sensor.motion',
        read: true,
        write: false,
    },
    native: {},
});

// Last motion timestamp
await this.setObjectNotExistsAsync(`${deviceName}.lastMotion`, {
    type: 'state',
    common: {
        name: 'Last Motion',
        type: 'number',
        role: 'value.time',
        read: true,
        write: false,
    },
    native: {},
});
```

### Configuration and Admin Interface

#### Admin Configuration Structure
```html
<!-- Device configuration table -->
<table class="table table-hover table-striped">
    <thead>
        <tr>
            <th>Name</th>
            <th>IP</th>
            <th>PIN</th>
            <th>Poll Interval (ms)</th>
            <th>Enabled</th>
        </tr>
    </thead>
    <tbody id="devices-table">
        <!-- Dynamic device rows -->
    </tbody>
</table>
```

#### Configuration Validation
```typescript
// Validate device configuration
private validateDeviceConfig(device: TableDevice): boolean {
    if (!device.name || !device.ip) {
        this.log.error('Device name and IP are required');
        return false;
    }
    
    if (!device.pin || device.pin.length < 4) {
        this.log.error('Valid PIN is required');
        return false;
    }
    
    if (device.pollInterval < 0) {
        this.log.warn('Poll interval must be positive (0 = push notifications)');
        device.pollInterval = 0;
    }
    
    return true;
}
```

## Common Issues and Solutions

### Device Communication Issues
```typescript
// Handle network timeouts
const TIMEOUT_MS = 10000;
const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Network timeout')), TIMEOUT_MS)
);

try {
    const result = await Promise.race([
        deviceOperation(),
        timeoutPromise
    ]);
    return result;
} catch (error) {
    this.log.warn(`Device communication failed: ${error.message}`);
    this.setState(`${deviceName}.info.connection`, false, true);
}
```

### Device Discovery Issues
```typescript
// Fallback for failed auto-detection
if (this.discoveredDevices.length === 0) {
    this.log.info('No devices auto-detected, using manual configuration');
    // Process manually configured devices from adapter settings
    for (const configDevice of this.config.devices) {
        if (configDevice.enabled) {
            await this.addManualDevice(configDevice);
        }
    }
}
```

### PIN Authentication Issues
```typescript
// Handle invalid PIN responses
if (authResponse.error === 'Invalid PIN') {
    this.log.error(`Invalid PIN for device ${deviceName}. Check device label for correct PIN.`);
    this.setState(`${deviceName}.info.connection`, false, true);
    return false;
}

// Handle encryption/decryption errors
try {
    const decryptedPIN = DeviceInfo.decrypt(encryptedPIN);
    return decryptedPIN;
} catch (error) {
    this.log.error(`PIN decryption failed: ${error.message}`);
    throw new Error('PIN decryption failed - check system.config secret');
}
```

### Memory Management
```typescript
// Cleanup intervals and connections
private onUnload(callback: () => void): void {
    try {
        // Clear all polling intervals
        this.devices.forEach(device => {
            if (device.pollInterval) {
                clearInterval(device.pollInterval);
            }
            if (device.connection) {
                device.connection.close();
            }
        });
        
        // Clear auto-detector
        if (this.autoDetector) {
            this.autoDetector.stop();
        }
        
        callback();
    } catch (error) {
        this.log.error(`Error during cleanup: ${error.message}`);
        callback();
    }
}
```

## Security and Performance

### Security Best Practices
```typescript
// Always encrypt PINs in configuration
const encryptedPIN = DeviceInfo.encrypt(userProvidedPIN);

// Validate input parameters
private validateIP(ip: string): boolean {
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipRegex.test(ip);
}

// Sanitize device names for object IDs
private sanitizeDeviceName(name: string): string {
    return name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
}
```

### Performance Optimization
```typescript
// Efficient polling with adaptive intervals
private calculateOptimalPollInterval(deviceType: string): number {
    switch (deviceType) {
        case 'motion_detector':
            return 5000; // 5 seconds for motion sensors
        case 'smart_plug':
            return 30000; // 30 seconds for plugs
        default:
            return 10000; // 10 seconds default
    }
}

// Batch state updates
private async updateDeviceStates(deviceName: string, states: Record<string, any>): Promise<void> {
    const promises = Object.entries(states).map(([stateName, value]) =>
        this.setStateAsync(`${deviceName}.${stateName}`, value, true)
    );
    await Promise.all(promises);
}
```

## Documentation Standards

### README Structure
```markdown
# ioBroker.adapter-name

## Installation
## Configuration  
## Usage
## Supported Devices
## Changelog
## License
```

### Code Documentation
```typescript
/**
 * Connects to a D-Link device and retrieves current state
 * @param ip - Device IP address
 * @param pin - Device PIN for authentication
 * @param timeout - Connection timeout in milliseconds
 * @returns Promise resolving to device state or null if failed
 */
async connectToDevice(ip: string, pin: string, timeout: number = 10000): Promise<DeviceState | null> {
    // Implementation
}
```

### Changelog Format
```markdown
## Changelog

### 1.0.0 (2024-01-01)
* (author) Initial release
* (author) Added support for DSP-W215
* (author) Fixed polling interval issues

### 0.9.0 (2023-12-01)
* (author) Beta release
```

## Project-Specific Instructions

**mydlink Adapter Specific Guidelines:**

### Device Model Support
When adding support for new D-Link devices:

1. **Device Detection**: Add device model to `KnownDevices.ts` with proper identification patterns
2. **Communication Protocol**: Determine if device uses SOAP (older) or WebSocket (newer) protocol
3. **State Definitions**: Define appropriate ioBroker states based on device capabilities
4. **Testing**: Create mock responses for integration tests since devices may not be available in CI

### Authentication Patterns
```typescript
// PIN validation for different device types
private validatePIN(pin: string, deviceModel: string): boolean {
    if (deviceModel.startsWith('DSP-W115') && pin === 'TELNET') {
        return true; // Special case for DSP-W115 TELNET access
    }
    return /^\d{6}$/.test(pin); // Standard 6-digit PIN
}
```

### Error Code Mapping
```typescript
// Map D-Link specific error codes to user-friendly messages
private mapDeviceError(errorCode: string): string {
    const errorMap = {
        'INVALID_PIN': 'Invalid device PIN. Check device label.',
        'DEVICE_BUSY': 'Device is busy. Try again later.',
        'NETWORK_ERROR': 'Cannot reach device. Check network connection.',
        'TIMEOUT': 'Device did not respond within timeout period.'
    };
    return errorMap[errorCode] || `Unknown device error: ${errorCode}`;
}
```

### Power Monitoring Calculations
```typescript
// Calculate power consumption statistics for DSP-W215
private calculatePowerStats(readings: number[]): PowerStats {
    const avg = readings.reduce((sum, val) => sum + val, 0) / readings.length;
    const max = Math.max(...readings);
    const min = Math.min(...readings);
    
    return {
        average: Math.round(avg * 100) / 100,
        maximum: max,
        minimum: min,
        samples: readings.length
    };
}
```

### Device-Specific Configuration
```typescript
// Device-specific settings based on model capabilities
interface DeviceCapabilities {
    hasPowerMonitoring: boolean;
    hasTemperatureSensor: boolean;
    supportsScheduling: boolean;
    communicationProtocol: 'soap' | 'websocket';
    defaultPollInterval: number;
}

const DEVICE_CAPABILITIES: Record<string, DeviceCapabilities> = {
    'DSP-W215': {
        hasPowerMonitoring: true,
        hasTemperatureSensor: true,
        supportsScheduling: true,
        communicationProtocol: 'soap',
        defaultPollInterval: 30000
    },
    'DSP-W115': {
        hasPowerMonitoring: false,
        hasTemperatureSensor: false,
        supportsScheduling: false,
        communicationProtocol: 'websocket',
        defaultPollInterval: 60000
    },
    'DCH-S150': {
        hasPowerMonitoring: false,
        hasTemperatureSensor: false,
        supportsScheduling: false,
        communicationProtocol: 'soap',
        defaultPollInterval: 5000
    }
};
```

### Network Discovery Optimization
```typescript
// Optimize mDNS discovery for D-Link devices
private configureMDNSDiscovery(): void {
    const discoveryOptions = {
        name: '_dcp._tcp.local', // D-Link Configuration Protocol
        timeout: 10000,
        question: {
            name: '_dcp._tcp.local',
            type: 'PTR'
        }
    };
    
    // Look for D-Link specific service announcements
    this.autoDetector.setDiscoveryOptions(discoveryOptions);
}
```