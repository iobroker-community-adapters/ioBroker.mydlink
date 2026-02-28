# ioBroker Adapter Development with GitHub Copilot

**Version:** 0.5.7  
**Template Source:** https://github.com/DrozmotiX/ioBroker-Copilot-Instructions

This file contains instructions and best practices for GitHub Copilot when working on ioBroker adapter development.

---

## 📑 Table of Contents

1. [Project Context](#project-context)
2. [Code Quality & Standards](#code-quality--standards)
   - [Code Style Guidelines](#code-style-guidelines)
   - [ESLint Configuration](#eslint-configuration)
3. [Testing](#testing)
   - [Unit Testing](#unit-testing)
   - [Integration Testing](#integration-testing)
   - [API Testing with Credentials](#api-testing-with-credentials)
4. [Development Best Practices](#development-best-practices)
   - [Dependency Management](#dependency-management)
   - [HTTP Client Libraries](#http-client-libraries)
   - [Error Handling](#error-handling)
5. [Admin UI Configuration](#admin-ui-configuration)
   - [JSON-Config Setup](#json-config-setup)
   - [Translation Management](#translation-management)
6. [Documentation](#documentation)
   - [README Updates](#readme-updates)
   - [Changelog Management](#changelog-management)
7. [CI/CD & GitHub Actions](#cicd--github-actions)
   - [Workflow Configuration](#workflow-configuration)
   - [Testing Integration](#testing-integration)

---

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

---

## Code Quality & Standards

### Code Style Guidelines

- Follow JavaScript/TypeScript best practices
- Use async/await for asynchronous operations
- Implement proper resource cleanup in `unload()` method
- Use semantic versioning for adapter releases
- Include proper JSDoc comments for public methods

**Timer and Resource Cleanup Example:**
```javascript
private connectionTimer?: NodeJS.Timeout;

async onReady() {
  this.connectionTimer = setInterval(() => this.checkConnection(), 30000);
}

onUnload(callback) {
  try {
    if (this.connectionTimer) {
      clearInterval(this.connectionTimer);
      this.connectionTimer = undefined;
    }
    callback();
  } catch (e) {
    callback();
  }
}
```

### ESLint Configuration

**CRITICAL:** ESLint validation must run FIRST in your CI/CD pipeline, before any other tests. This "lint-first" approach catches code quality issues early.

#### Setup
```bash
npm install --save-dev eslint @iobroker/eslint-config
```

#### Configuration (.eslintrc.json)
```json
{
  "extends": "@iobroker/eslint-config",
  "rules": {
    // Add project-specific rule overrides here if needed
  }
}
```

#### Package.json Scripts
```json
{
  "scripts": {
    "lint": "eslint --max-warnings 0 .",
    "lint:fix": "eslint . --fix"
  }
}
```

#### Best Practices
1. ✅ Run ESLint before committing — fix ALL warnings, not just errors
2. ✅ Use `lint:fix` for auto-fixable issues
3. ✅ Don't disable rules without documentation
4. ✅ Lint all relevant files (main code, tests, build scripts)
5. ✅ Keep `@iobroker/eslint-config` up to date
6. ✅ **ESLint warnings are treated as errors in CI** (`--max-warnings 0`). The `lint` script above already includes this flag — run `npm run lint` to match CI behavior locally

#### Common Issues
- **Unused variables**: Remove or prefix with underscore (`_variable`)
- **Missing semicolons**: Run `npm run lint:fix`
- **Indentation**: Use 4 spaces (ioBroker standard)
- **console.log**: Replace with `adapter.log.debug()` or remove

---

## Testing

### Unit Testing

- Use Jest as the primary testing framework
- Create tests for all adapter main functions and helper methods
- Test error handling scenarios and edge cases
- Mock external API calls and hardware dependencies
- For adapters connecting to APIs/devices not reachable by internet, provide example data files

**Example Structure:**
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

**CRITICAL:** Use the official `@iobroker/testing` framework. This is the ONLY correct way to test ioBroker adapters.

**Official Documentation:** https://github.com/ioBroker/testing

#### Framework Structure

**✅ Correct Pattern:**
```javascript
const path = require('path');
const { tests } = require('@iobroker/testing');

tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Test adapter with specific configuration', (getHarness) => {
            let harness;

            before(() => {
                harness = getHarness();
            });

            it('should configure and start adapter', function () {
                return new Promise((resolve, reject) => {
                    harness.objects.getObject('system.adapter.mydlink.0', (err, obj) => {
                        if (err) return reject(err);
                        if (!obj) return reject(new Error('Adapter object not found'));

                        // Configure adapter with test device
                        Object.assign(obj.native, {
                            devices: [{ name: 'test', ip: '192.168.1.100', pin: '000000', pollInterval: 30000, enabled: true }]
                        });

                        harness.objects.setObject(obj._id, obj, async (setErr) => {
                            if (setErr) return reject(setErr);
                            try {
                                // Start and wait
                                await harness.startAdapterAndWait();
                                await new Promise(res => setTimeout(res, 15000));
                                await harness.stopAdapter();
                                resolve(true);
                            } catch (error) {
                                reject(error);
                            }
                        });
                    });
                });
            }).timeout(40000);
        });
    }
});
```

#### Integration Testing for mydlink Adapter

For the mydlink adapter, create specific tests for:
- Device discovery and connection
- SOAP/WebSocket communication patterns
- PIN authentication flows
- Device state synchronization
- Error handling for unreachable devices
- Mock D-Link device responses using example XML/JSON data

#### Key Rules

1. ✅ Use `@iobroker/testing` framework
2. ✅ Configure via `harness.objects.setObject()`
3. ✅ Start via `harness.startAdapterAndWait()`
4. ✅ Verify states via `harness.states.getState()`
5. ✅ Allow proper timeouts for async operations
6. ❌ NEVER test API URLs directly
7. ❌ NEVER bypass the harness system

#### Workflow Dependencies

Integration tests should run ONLY after lint and adapter tests pass:

```yaml
integration-tests:
  needs: [check-and-lint, adapter-tests]
  runs-on: ubuntu-22.04
```

### API Testing with Credentials

For adapters connecting to external APIs requiring authentication:

#### Password Encryption for Integration Tests

```javascript
async function encryptPassword(harness, password) {
    const systemConfig = await harness.objects.getObjectAsync("system.config");
    if (!systemConfig?.native?.secret) {
        throw new Error("Could not retrieve system secret for password encryption");
    }
    
    const secret = systemConfig.native.secret;
    let result = '';
    for (let i = 0; i < password.length; ++i) {
        result += String.fromCharCode(secret[i % secret.length].charCodeAt(0) ^ password.charCodeAt(i));
    }
    return result;
}
```

---

## Development Best Practices

### Dependency Management

- Always use `npm` for dependency management
- Use `npm ci` for installing existing dependencies (respects package-lock.json)
- Use `npm install` only when adding or updating dependencies
- Keep dependencies minimal and focused
- Only update dependencies in separate Pull Requests

**When modifying package.json:**
1. Run `npm install` to sync package-lock.json
2. Commit both package.json and package-lock.json together

**Best Practices:**
- Prefer built-in Node.js modules when possible
- Use `@iobroker/adapter-core` for adapter base functionality
- Avoid deprecated packages
- Document specific version requirements

### HTTP Client Libraries

- **Preferred:** Use native `fetch` API (Node.js 20+ required)
- **Avoid:** `axios` unless specific features are required

**Example with fetch:**
```javascript
try {
  const response = await fetch('https://api.example.com/data');
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const data = await response.json();
} catch (error) {
  this.log.error(`API request failed: ${error.message}`);
}
```

**Other Recommendations:**
- **Logging:** Use adapter built-in logging (`this.log.*`)
- **Scheduling:** Use adapter built-in timers and intervals
- **File operations:** Use Node.js `fs/promises`
- **Configuration:** Use adapter config system

### Error Handling

- Always catch and log errors appropriately
- Use adapter log levels (error, warn, info, debug)
- Provide meaningful, user-friendly error messages
- Handle network failures gracefully
- Implement retry mechanisms where appropriate
- Always clean up timers, intervals, and resources in `unload()` method

**Example:**
```javascript
try {
  await this.connectToDevice();
} catch (error) {
  this.log.error(`Failed to connect to device: ${error.message}`);
  this.setState('info.connection', false, true);
  // Implement retry logic if needed
}
```

---

## Admin UI Configuration

### JSON-Config Setup

Use JSON-Config format for modern ioBroker admin interfaces.

**Example Structure:**
```json
{
  "type": "panel",
  "items": {
    "host": {
      "type": "text",
      "label": "Host address",
      "help": "IP address or hostname of the device"
    }
  }
}
```

**Guidelines:**
- ✅ Use consistent naming conventions
- ✅ Provide sensible default values
- ✅ Include validation for required fields
- ✅ Add tooltips for complex options
- ✅ Ensure translations for all supported languages (minimum English and German)
- ✅ Write end-user friendly labels, avoid technical jargon

### Translation Management

**CRITICAL:** Translation files must stay synchronized with `admin/jsonConfig.json`. Orphaned keys or missing translations cause UI issues and PR review delays.

#### Overview
- **Location:** `admin/i18n/{lang}/translations.json` for 11 languages (de, en, es, fr, it, nl, pl, pt, ru, uk, zh-cn)
- **Source of truth:** `admin/jsonConfig.json` - all `label` and `help` properties must have translations
- **Command:** `npm run translate` - auto-generates translations but does NOT remove orphaned keys
- **Formatting:** English uses tabs, other languages use 4 spaces

#### Critical Rules
1. ✅ Keys must match exactly with jsonConfig.json
2. ✅ No orphaned keys in translation files
3. ✅ All translations must be in native language (no English fallbacks)
4. ✅ Keys must be sorted alphabetically

#### Translation Checklist

Before committing changes to admin UI or translations:
1. ✅ No orphaned keys in any translation file
2. ✅ All translations in native language
3. ✅ Keys alphabetically sorted
4. ✅ `npm run lint` passes
5. ✅ `npm run test` passes

---

## Documentation

### README Updates

#### Required Sections
1. **Installation** - Clear npm/ioBroker admin installation steps
2. **Configuration** - Detailed configuration options with examples
3. **Usage** - Practical examples and use cases
4. **Changelog** - Version history (use "## **WORK IN PROGRESS**" for ongoing changes)
5. **License** - License information (typically MIT for ioBroker adapters)
6. **Support** - Links to issues, discussions, community support

#### Documentation Standards
- Use clear, concise language
- Include code examples for configuration
- Add screenshots for admin interface when applicable
- Maintain multilingual support (minimum English and German)
- Always reference issues in commits and PRs (e.g., "fixes #xx")

#### Mandatory README Updates for PRs

For **every PR or new feature**, always add a user-friendly entry to README.md:

- Add entries under `## **WORK IN PROGRESS**` section
- Use format: `* (author) **TYPE**: Description of user-visible change`
- Types: **NEW** (features), **FIXED** (bugs), **ENHANCED** (improvements), **TESTING** (test additions), **CI/CD** (automation)
- Focus on user impact, not technical details

**Example:**
```markdown
## **WORK IN PROGRESS**

* (DutchmanNL) **FIXED**: Adapter now properly validates login credentials (fixes #25)
* (DutchmanNL) **NEW**: Added device discovery to simplify initial setup
```

### Changelog Management

Follow the [AlCalzone release-script](https://github.com/AlCalzone/release-script) standard.

#### Format Requirements

```markdown
# Changelog

<!--
  Placeholder for the next version (at the beginning of the line):
  ## **WORK IN PROGRESS**
-->

## **WORK IN PROGRESS**

- (author) **NEW**: Added new feature X
- (author) **FIXED**: Fixed bug Y (fixes #25)

## v0.1.0 (2023-01-01)
Initial release
```

#### Workflow Process
- **During Development:** All changes go under `## **WORK IN PROGRESS**`
- **For Every PR:** Add user-facing changes to WORK IN PROGRESS section
- **Before Merge:** Version number and date added when merging to main
- **Release Process:** Release-script automatically converts placeholder to actual version

#### Change Entry Format
- Format: `- (author) **TYPE**: User-friendly description`
- Types: **NEW**, **FIXED**, **ENHANCED**
- Focus on user impact, not technical implementation
- Reference issues: "fixes #XX" or "solves #XX"

---

## CI/CD & GitHub Actions

### Workflow Configuration

#### GitHub Actions Best Practices

**Must use ioBroker official testing actions:**
- `ioBroker/testing-action-check@v1` for lint and package validation
- `ioBroker/testing-action-adapter@v1` for adapter tests
- `ioBroker/testing-action-deploy@v1` for automated releases with Trusted Publishing (OIDC)

**Configuration:**
- **Node.js versions:** Test on 20.x, 22.x, 24.x
- **Platform:** Use ubuntu-22.04
- **Automated releases:** Deploy to npm on version tags (requires NPM Trusted Publishing)
- **Monitoring:** Include Sentry release tracking for error monitoring

#### Critical: Lint-First Validation Workflow

**ALWAYS run ESLint checks BEFORE other tests.** Benefits:
- Catches code quality issues immediately
- Prevents wasting CI resources on tests that would fail due to linting errors
- Provides faster feedback to developers
- Enforces consistent code quality

**Workflow Dependency Configuration:**
```yaml
jobs:
  check-and-lint:
    # Runs ESLint and package validation
    # Uses: ioBroker/testing-action-check@v1
    
  adapter-tests:
    needs: [check-and-lint]  # Wait for linting to pass
    # Run adapter unit tests
    
  integration-tests:
    needs: [check-and-lint, adapter-tests]  # Wait for both
    # Run integration tests
```

**Key Points:**
- The `check-and-lint` job has NO dependencies - runs first
- ALL other test jobs MUST list `check-and-lint` in their `needs` array
- If linting fails, no other tests run, saving time
- Fix all ESLint errors before proceeding

### Testing Integration

#### Testing Best Practices
- Run credential tests separately from main test suite
- Don't make credential tests required for deployment
- Provide clear failure messages for API issues
- Use appropriate timeouts for external calls (120+ seconds)

---

## mydlink Adapter Specific Guidelines

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

### Device Communication Patterns

#### SOAP Communication
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

#### WebSocket Communication
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

### Device Configuration and PIN Handling
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

### Power Monitoring and Device State Patterns

#### Power Monitoring (DSP-W215)
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

// Calculate power consumption statistics
private calculatePowerStats(readings: number[]): PowerStats {
    const avg = readings.reduce((sum, val) => sum + val, 0) / readings.length;
    return {
        average: Math.round(avg * 100) / 100,
        maximum: Math.max(...readings),
        minimum: Math.min(...readings),
        samples: readings.length
    };
}
```

#### Motion Detection (DCH-S150)
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
```

### Device-Specific Configuration
```typescript
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

### Network Discovery and Memory Management
```typescript
// Optimize mDNS discovery for D-Link devices
private configureMDNSDiscovery(): void {
    const discoveryOptions = {
        name: '_dcp._tcp.local', // D-Link Configuration Protocol
        timeout: 10000,
        question: { name: '_dcp._tcp.local', type: 'PTR' }
    };
    this.autoDetector.setDiscoveryOptions(discoveryOptions);
}

// Cleanup intervals and connections on unload
private onUnload(callback: () => void): void {
    try {
        this.devices.forEach(device => {
            if (device.pollInterval) clearInterval(device.pollInterval);
            if (device.connection) device.connection.close();
        });
        if (this.autoDetector) this.autoDetector.stop();
        callback();
    } catch (error) {
        this.log.error(`Error during cleanup: ${error.message}`);
        callback();
    }
}
```