import type { Client } from './Clients';
import { DeviceInfo } from './DeviceInfo';
import { Suffixes } from './suffixes';
import type { Mydlink } from './mydlink';

/**
 * Error indicating wrong MAC address.
 */
export class WrongMacError extends Error {
    static errorName = 'WRONGMAC';
    name = 'WRONGMAC';

    /**
     * Creates an instance of WrongMacError.
     *
     * @param message Error message
     */
    constructor(message: string) {
        super(message);
    }
}

/**
 * Error indicating wrong model.
 */
export class WrongModelError extends Error {
    static errorName = 'WRONGMODEL';
    name = 'WRONGMODEL';

    /**
     * Creates an instance of WrongModelError.
     *
     * @param message Error message
     */
    constructor(message: string) {
        super(message);
    }
}

/**
 * Time to wait before next login, if the device refuses logins.
 */
const LOGIN_BLOCK_TIME = 10 * 60 * 1000;

/**
 * Get code from network error.
 *
 * @param e error object
 * @returns code as number or string
 */
export function processNetworkError(e: Record<string, any>): number | string {
    if (e.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        //See if we are logged out -> login again on next poll.
        //otherwise ignore and try again later?
        return e.response.status;
    } else if (e.request) {
        // The request was made but no response was received
        // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
        // http.ClientRequest in node.js
        //probably ECONNRESET or Timeout -> e.code should be set.
        return e.code;
    }
    //something else...?
    return e.code;
}

/**
 * Abstract device class. All devices inherit from this.
 */
export abstract class Device extends DeviceInfo {
    readonly adapter: Mydlink;
    abstract client: Client;
    protected constructor(adapter: Mydlink, ip: string, pin: string, pinEncrypted: boolean) {
        super(ip, pin, pinEncrypted);
        this.adapter = adapter;
    }

    /**
     * Stores device configuration as Device Object in ioBroker Database.
     */
    async createDeviceObject(): Promise<void> {
        //do something here.
        if (!this.id) {
            if (!this.mac) {
                this.adapter.log.warn(
                    `Could not create device ${this.name} without MAC. Please check config or if device is online.`,
                );
                return;
            }
        }

        //also set the native part of the device:
        await this.adapter.extendObject(this.id, {
            type: 'device',
            common: {
                name: this.name,
                statusStates: {
                    onlineId: `${this.adapter.namespace}.${this.id}${Suffixes.reachable}`,
                },
            },
            native: {
                ip: this.ip,
                mac: this.mac,
                pin: this.pinEncrypted,
                pollInterval: Number(this.pollInterval),
                enabled: this.enabled,
                name: this.name,
                model: this.model,
                useWebSocket: this.isWebsocket,
                pinNotEncrypted: false,
            },
        });
    }

    /**
     * Creates state-objects for the device.
     */
    async createObjects(): Promise<void> {
        //enabled indicator:
        await this.adapter.setObjectNotExistsAsync(this.id + Suffixes.enabled, {
            type: 'state',
            common: {
                name: 'enabled',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        //have ready indicator:
        await this.adapter.setObjectNotExistsAsync(this.id + Suffixes.unreachable, {
            type: 'state',
            common: {
                name: 'unreach',
                type: 'boolean',
                role: 'indicator.maintenance.unreach',
                read: true,
                write: false,
            },
            native: {},
        });

        //have ready indicator:
        await this.adapter.setObjectNotExistsAsync(this.id + Suffixes.reachable, {
            type: 'state',
            common: {
                name: 'device is reachable',
                type: 'boolean',
                role: 'indicator.reachable',
                read: true,
                write: false,
            },
            native: {},
        });
    }

    /**
     * (Re-)schedules the next poll or reconnect. Does nothing while the adapter is unloading, so requests that were
     * still running during unload don't start new timers.
     *
     * @param callback function to call
     * @param timeout time in ms
     */
    protected schedule(callback: () => void | Promise<void>, timeout: number): void {
        if (this.intervalHandle) {
            this.adapter.clearTimeout(this.intervalHandle);
            this.intervalHandle = undefined;
        }
        if (!this.adapter.unloading) {
            this.intervalHandle = this.adapter.setTimeout(callback, timeout);
        }
    }

    /**
     * Stops communication with device.
     */
    stop(): void {
        if (this.intervalHandle) {
            this.adapter.clearTimeout(this.intervalHandle);
        }
        if (this.client && typeof this.client.disconnect === 'function') {
            this.client.disconnect();
        }
        this.ready = false;
        this.loggedIn = false;
    }

    /**
     * Blocks further logins for some time, e.g. because the device refuses them.
     *
     * @param message warning to log
     */
    protected blockLogin(message: string): void {
        this.loginBlockedUntil = Date.now() + LOGIN_BLOCK_TIME;
        this.loggedIn = false;
        this.adapter.log.warn(message);
    }

    /**
     * Starts log in for device. Needs to be done before additional commands can work.
     */
    async login(): Promise<boolean> {
        if (this.loginBlockedUntil > Date.now()) {
            this.adapter.log.debug(
                `${this.name}: no login before ${new Date(this.loginBlockedUntil).toLocaleTimeString()}.`,
            );
            this.loggedIn = false;
            this.scheduleRetryWithoutPolling();
            return false;
        }
        try {
            const loginResult = await this.client.login();
            if (loginResult === true) {
                this.adapter.log.debug(`${this.name} successfully logged in: ${loginResult}`);
                this.loggedIn = true;
                this.loginErrorPrinted = false;
            } else {
                if (!this.loginErrorPrinted) {
                    this.loginErrorPrinted = true;
                    this.loggedIn = false;
                    this.adapter.log.debug(
                        `Login error: device returned ${loginResult} - this should not really happen.`,
                    );
                    this.adapter.log.error(
                        `${this.name} could not login. Please check credentials and if device is online/connected.`,
                    );
                }
            }
        } catch (e: any) {
            this.adapter.log.debug(`Login error: ${e.stack}`);

            if (e.code === 34) {
                //websocket devices lock themselves after 10 invalid device tokens within 10 minutes.
                this.blockLogin(
                    `${this.name} refuses logins, because it got too many invalid device tokens. Please check the PIN and other programs that access the device (e.g. old versions of this adapter). Will try again in 10 minutes.`,
                );
            } else if (
                !this.loginErrorPrinted &&
                e.code !== 'ETIMEDOUT' &&
                e.code !== 'ECONNABORTED' &&
                e.code !== 'ECONNRESET' &&
                this.model
            ) {
                this.adapter.log.error(
                    `${this.name} could not login. Please check credentials and if device is online/connected. Error: ${
                        e.code
                    } - ${e.stack}`,
                );
                this.loginErrorPrinted = true;
            }

            this.loggedIn = false;
            this.scheduleRetryWithoutPolling();
        }
        return this.loggedIn;
    }

    /**
     * If no polling takes place, login needs to be retried here.
     */
    private scheduleRetryWithoutPolling(): void {
        if (!this.pollInterval && this.model) {
            this.schedule(() => this.start(), Math.max(10000, this.loginBlockedUntil - Date.now()));
        }
    }

    /**
     * Identification of device needs to happen after successful login.
     * Problem: Maybe needs to create new object of new type. Hm...
     */
    async identify(): Promise<boolean> {
        //for device identification by IP set name to model here:
        if (!this.name) {
            this.name = this.model;
        }

        await this.createObjects();
        this.identified = true;
        return this.identified;
    }

    /**
     * Handle network error during communication.
     *
     * @param e error object
     * @returns code as number or string
     */
    async handleNetworkError(e: any): Promise<number | string> {
        const code = processNetworkError(e);
        if ([403, 424].includes(code as number) || this.ready) {
            this.loggedIn = false; //login next polling.
        }
        this.adapter.log.debug(`Error during communication ${this.name}: ${code} - ${e.stack} - ${e.body}`);
        this.ready = false;
        if (this.id) {
            await this.adapter.setStateChangedAsync(this.id + Suffixes.unreachable, true, true);
            await this.adapter.setStateChangedAsync(this.id + Suffixes.reachable, false, true);
        }
        return code;
    }

    /**
     * Do polling here.
     *
     * @returns void
     */
    async onInterval(): Promise<void> {
        //this.log.debug('Polling ' + this.name);
        try {
            if (!this.loggedIn) {
                await this.login();
            }
            if (this.loggedIn && !this.identified) {
                await this.identify();
            }
            if (this.loggedIn && this.identified) {
                this.ready = await this.client.isDeviceReady();
                await this.adapter.setStateChangedAsync(this.id + Suffixes.unreachable, !this.ready, true);
                await this.adapter.setState(this.id + Suffixes.reachable, this.ready, true);
            }
        } catch (e: any) {
            await this.handleNetworkError(e);
        }

        if (this.pollInterval > 0) {
            //only start timeout again, if set in settings.
            this.schedule(() => this.onInterval(), this.pollInterval);
        }
    }

    /**
     * starting communication with device from config.
     *
     * @returns void
     */
    async start(): Promise<void> {
        //if device was already started -> stop it.
        //(use case: ip did change or settings did change)
        if (this.ready) {
            this.stop();
        }

        //interrogate enabled devices
        //this will get MAC for manually configured devices.
        if (this.enabled) {
            //login:
            await this.login();
            if (this.loggedIn) {
                try {
                    await this.identify();
                    this.ready = await this.client.isDeviceReady();
                    await this.adapter.setState(this.id + Suffixes.reachable, this.ready, true);
                    await this.adapter.setState(this.id + Suffixes.unreachable, !this.ready, true);
                } catch (e: any) {
                    this.adapter.log.error(`${this.name} could not identify device: ${e.stack}`);
                }
            }
        }

        //transfer enabled flag to object (only possible once the device is identified and has an id):
        if (this.id) {
            await this.adapter.setState(this.id + Suffixes.enabled, { val: this.enabled, ack: true });
        }

        //start polling if device is enabled (do this after all is set up).
        if (this.enabled) {
            //some devices, for example W245, don't push. So poll websocket also.
            let interval = this.pollInterval;
            if (interval !== undefined && !Number.isNaN(interval) && interval > 0) {
                if (interval < 500) {
                    this.adapter.log.warn('Increasing poll rate to twice per second. Please check device config.');
                    interval = 500; //polling twice every second should be enough, right?
                }
                if (interval >= 2147483647) {
                    interval = 2147483646;
                    this.adapter.log.warn('Poll rate was too high, reduced to prevent issues.');
                }
                this.adapter.log.debug(`Start polling for ${this.name} with interval ${interval}`);
                this.pollInterval = interval;
                this.schedule(() => this.onInterval(), this.pollInterval);
            } else {
                this.pollInterval = 0;
                this.adapter.log.debug(`Polling of ${this.name} disabled, interval was ${interval} (0 means disabled)`);
            }
        }
    }

    /**
     * process a state change.
     *
     * @param _id of state
     * @param _state new state
     */
    async handleStateChange(_id: string, _state: ioBroker.State): Promise<void> {
        if (!this.loggedIn) {
            await this.login();
        }
    }
}
