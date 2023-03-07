import { DeviceInfo } from './DeviceInfo';

export interface Client {
    getDeviceId(): string;

    /**
     * Read state(s) of socket/device index. Use -1 to get all states.
     * @param index
     */
    state(index?: number) : Promise<boolean | Array<boolean>>;

    /**
     * Change the state of a socket.
     * @param on new value of switch.
     * @param index
     */
    switch(on: boolean, index?: number) : Promise<boolean | void>;

    /**
     * Login to real device using device info
     */
    login(device: DeviceInfo) : Promise<boolean>;

    /**
     * Close connection, i.e. clean up.
     */
    disconnect() : void;

    /**
     * Should return true if device is ready to use and false otherwise.
     */
    isDeviceReady(): boolean;
}

export interface WebSocketClientInterface extends Client {
    on(event: string, callback: (valueOrCodeOrMessage?: boolean | number | string, indexOrError?: number | Error | undefined) => void) : void;
    removeAllListeners(event: string): void;
}

export interface SoapClient extends Client {
    getDeviceSettings():  Promise<Record<string, string>>;
    getDeviceDescriptionXML(): Promise<Record<string, string>>;
    lastDetection(): Promise<number>;
    temperature(): Promise<number>;
    consumption(): Promise<number>;
    totalConsumption(): Promise<number>;
    reboot(): Promise<void>;
}
