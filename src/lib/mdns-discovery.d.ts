declare module 'mdns-discovery' {
    class Mdns {
        constructor(parameters: Record<string, any>);

        on(event: string, callback: method);
        run(callback: method);
        close();
    }
}
