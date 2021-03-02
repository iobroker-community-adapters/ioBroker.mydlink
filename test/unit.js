const path = require('path');
const { tests } = require('@iobroker/testing');

const sinon_1 = require('sinon');

const clientMock = {

};

const dspW115Mock = {

};

const dspW215Mock = {

};

const dchS150Mock = {

};

const dchS160Mock = {

};

// Run unit tests - See https://github.com/ioBroker/testing for a detailed explanation and further options
tests.unit(path.join(__dirname, '..'), {
    // optionally define which modules should be mocked.
    additionalMockedModules: {
        //"noble": nobleMock,
        //"@abandonware/noble": nobleMock,
        // Use the {CONTROLLER_DIR} placeholder to access the path where JS-Controller would be installed.
        // Don't forget to provide mocks for every module you need, as they don't exist in unit tests
        //"{CONTROLLER_DIR}/lib/tools.js": {},
    },

    defineMockBehavior(database, adapter) {
        adapter.getDevicesAsync = sinon_1.stub();
        adapter.getDevicesAsync.returns(Promise.resolve([]));
    }
});

