/**
 * Base interface for all clients.
 */
export interface Client {
    /**
     * Read state(s) of socket/device index. Use -1 to get all states.
     *
     * @param index
     */
    state(index?: number): Promise<boolean | Array<boolean>>;

    /**
     * Login to real device using device info
     */
    login(): Promise<boolean>;

    /**
     * Close connection, i.e. clean up.
     */
    disconnect(): void;

    /**
     * Should return true if device is ready to use and false otherwise.
     */
    isDeviceReady(): Promise<boolean> | boolean;
}

/**
 * Interface for SOAP clients.
 */
export interface SoapClientInterface extends Client {
    /**
     * Get device settings as key/value pairs.
     */
    getDeviceSettings(): Promise<Record<string, string>>;

    /**
     * Get last detection timestamp.
     */
    lastDetection(): Promise<number>;

    /**
     * Get temperature in Celsius.
     */
    temperature(): Promise<number>;

    /**
     * Get current power consumption in Watts.
     */
    consumption(): Promise<number>;

    /**
     * Get total power consumption in kWh.
     */
    totalConsumption(): Promise<number>;

    /**
     * Perform a device reboot.
     */
    reboot(): Promise<boolean>;

    /**
     * Get device description XML and supported SOAP actions.
     */
    getDeviceDescriptionXML(): Promise<{
        deviceSettingsXML: string;
        modulesSoapActions: string;
    }>;

    /**
     * Get current sound play settings.
     */
    getSoundPlay(): Promise<boolean>;

    /**
     * Set sound play settings.
     *
     * @param sound sound to play
     * @param volume volume of sound
     * @param duration duration of sound in seconds
     */
    setSoundPlay(sound: number, volume: number, duration: number): Promise<boolean>;

    /**
     * Dismiss alarm.
     */
    setAlarmDismissed(): Promise<boolean>;

    /**
     * Change the state of a socket.
     *
     * @param on new value of switch.
     */
    switch(on: boolean): Promise<boolean | void>;
}
