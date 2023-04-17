declare module 'soadclient' {
    function createSoapclient ({user: string, url: string, password: string}) : {
        login: function;
    }
}
