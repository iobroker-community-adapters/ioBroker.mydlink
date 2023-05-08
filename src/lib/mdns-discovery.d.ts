
declare module 'mdns-discovery' {
    export class MulticastDNS {
        constructor(opts: any);
        close() : void;
        on(event : string, callback : function) : void;
        run(callback : function) : void;
    }

    export default MulticastDNS;
}
