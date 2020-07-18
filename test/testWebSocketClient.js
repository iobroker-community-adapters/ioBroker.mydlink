const WebSocketClient = require('dlink_websocketclient');

async function main() {
    const client = new WebSocketClient({
        ip: '192.168.0.189',
        pin: '180F76CC6C09-02c0202a-194b-4eda-7f67-0b632e538b03',
        model: 'w115'
    });

    await client.login();
    console.log('Signed in!');
    let state = await client.state();
    console.log('Socket is ' + (state ? 'on' : 'off'));

    await client.switchLED(false);
    process.exit();

    setInterval(async function() {
        const state = await client.state();
        await client.switch(!state);
    }, 5000);
    await client.switch(true);
    console.log('Switched on!');
    await client.state();
    console.log('Got state.');
    await client.isDeviceReady();
    console.log('isReady');
}

main().catch((e) => {
    console.log('Had error:', e);
    process.exit();
});
