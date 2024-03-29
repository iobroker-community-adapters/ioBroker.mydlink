export interface Client {
    /**
     * Read state(s) of socket/device index. Use -1 to get all states.
     * @param index
     */
    state(index?: number) : Promise<boolean | Array<boolean>>;

    /**
     * Login to real device using device info
     */
    login() : Promise<boolean>;

    /**
     * Close connection, i.e. clean up.
     */
    disconnect() : void;

    /**
     * Should return true if device is ready to use and false otherwise.
     */
    isDeviceReady(): Promise<boolean> | boolean;
}

export interface SoapClientInterface extends Client {
    getDeviceSettings():  Promise<Record<string, string>>;
    lastDetection(): Promise<number>;
    temperature(): Promise<number>;
    consumption(): Promise<number>;
    totalConsumption(): Promise<number>;
    reboot(): Promise<boolean>;
    getDeviceDescriptionXML(): Promise<{deviceSettingsXML: string, modulesSoapActions: string}>;
    getSoundPlay(): Promise<boolean>;
    setSoundPlay(sound: number, volume: number, duration : number) : Promise<boolean>;
    setAlarmDismissed(): Promise<boolean>;

    /**
     * Change the state of a socket.
     * @param on new value of switch.
     */
    switch(on: boolean) : Promise<boolean | void>;
}
