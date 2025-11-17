declare module 'mdns-discovery' {
    /**
     * MulticastDNS class for mDNS service discovery
     */
    export class MulticastDNS {
        constructor(opts: any);
        close(): void;
        on(event: string, callback: function): void;
        run(callback: function): void;
    }

    export default MulticastDNS;
}
