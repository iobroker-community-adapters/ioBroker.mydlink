import { WebSocketClient } from 'dlink_websocketclient';
import {Device, processNetworkError} from './Device';
import {Suffixes} from './suffixes';
import {Mydlink} from '../main';

export class WebSocketDevice extends Device {
    client: WebSocketClient;

    numSockets = 1;

    constructor(adapter: Mydlink, ip: string, pin: string, pinEncrypted: boolean) {
        super(adapter, ip, pin, pinEncrypted);
        this.isWebsocket = true;

        this.client = new WebSocketClient({
            ip: this.ip,
            pin: this.pinDecrypted,
            keepAlive: 5,
            useTelnetForToken: this.pinDecrypted.toUpperCase() === 'TELNET',
            log: console.debug
        });
    }

    /**
     * Creates objects for the device.
     */
    async createObjects() {
        await super.createObjects();
        if (this.numSockets > 1) {
            //create state for each socket.
            for (let index = 1; index <= this.numSockets; index += 1) {
                const id = this.id + Suffixes.state + '_' + index;
                await this.adapter.setObjectNotExistsAsync(id, {
                    type: 'state',
                    common: {
                        name: 'Socket ' + index,
                        type: 'boolean',
                        role: 'switch',
                        read: true,
                        write: true
                    },
                    native: { index: index }
                });
                await this.adapter.subscribeStatesAsync(id);
            }
        } else {
            //create state object, for plug this is writable for sensor not.
            await this.adapter.setObjectNotExistsAsync(this.id + Suffixes.state, {
                type: 'state',
                common: {
                    name: 'state of plug',
                    type: 'boolean',
                    role: 'switch',
                    read: true,
                    write: true
                },
                native: {}
            });
            await this.adapter.subscribeStatesAsync(this.id + Suffixes.state);
        }
    }

    stop() : void {
        super.stop();
        if (this.client && typeof this.client.removeAllListeners === 'function') {
            this.client.removeAllListeners('switch');
            this.client.removeAllListeners('error');
            this.client.removeAllListeners('close');
        }
    }

    /**
     * Do polling here.
     * @returns {Promise<void>}
     */
    async onInterval() : Promise<void> {
        await super.onInterval();
        // if not ready -> communication did fail, will be retried on next poll.
        if (this.ready) {
            if (this.numSockets > 1) {
                const states = await this.client.state(-1) as Array<boolean>; //get all socket states.
                for (let index = 1; index <= this.numSockets; index += 1) {
                    const id = this.id + Suffixes.state + '_' + index;
                    const val = states[index - 1];
                    await this.adapter.setStateChangedAsync(id, val, true);
                }
            } else {
                const val = await this.client.state(0) as boolean;
                await this.adapter.setStateChangedAsync(this.id + Suffixes.state, val, true);
            }
        }
    }

    /**
     * Error handler for event base client.
     */
    async onError(code? : number, err? : Error) : Promise<void> {
        await this.adapter.setStateAsync(this.id + Suffixes.unreachable, true, true);
        if (code || err) {
            this.adapter.log.debug(`${this.name}: Socket error: ${code} - ${(err ? err.stack : err)}`);
        } else {
            this.adapter.log.debug(this.name + ': Socket closed.');
        }
        this.stop();
        this.ready = false;
        //abuse unused intervalHandle here.
        if (this.intervalHandle) {
            clearTimeout(this.intervalHandle);
        }
        this.intervalHandle = setTimeout(() => {
            this.start();
        }, 10000);
    }

    /**
     * starting communication with device from config.
     * @returns {Promise<boolean>}
     */
    async start() : Promise<boolean> {
        const result = super.start();
        //event listener:
        this.client.on('switched', (val, socket) => {
            this.adapter.log.debug(`Event from device ${socket} now ${val}`);
            if (this.numSockets > 1) {
                this.adapter.setStateAsync(this.id + Suffixes.state + '_' + (socket + 1), val, true);
            } else {
                this.adapter.setStateAsync(this.id + Suffixes.state, val, true);
            }
        });
        //error handling:
        this.client.on('error', (code, error) => this.onError(code, error));
        this.client.on('close', () => this.onError());
        this.client.on('message', (message) => this.adapter.log.debug(`${this.name} got message: ${message}`));
        await this.adapter.setStateAsync(this.id + Suffixes.unreachable, false, true);
        this.ready = true;
        this.adapter.log.debug('Setup device event listener.');

        return result;
    }

    /**
     * process a state change. Device will just try to switch plug. Childs will have to overwrite this behaviour.
     * @param id
     * @param state
     */
    async handleStateChange(id : string, state : ioBroker.State) {
        if (typeof state.val === 'boolean') {
            if (!this.loggedIn) {
                await this.login();
            }

            let socket = 0;
            if (this.numSockets > 1) {
                socket = Number(id.substring(id.lastIndexOf('_') + 1)) - 1; //convert to 0 based index here.
            }
            try {
                const newVal = await this.client.switch(state.val, socket);
                this.adapter.log.debug(`Switched Socket ${socket} of ${this.name} ${state.val ? 'on' : 'off'}.`);
                await this.adapter.setStateAsync(id, newVal, true);
            } catch(e: any) {
                const code = processNetworkError(e);
                if (code === 403) {
                    this.loggedIn = false; //login next polling.
                }
                this.adapter.log.error('Error while switching device ' + this.name + ': ' + code + ' - ' + e.stack);
            }
        } else {
            this.adapter.log.warn('Wrong state type. Only boolean accepted for switch.');
        }
    }

}
