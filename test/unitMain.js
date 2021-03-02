import { tests, utils } from "@iobroker/testing";

// Run tests
tests.unit(path.join(__dirname, ".."), {
    //     ~~~~~~~~~~~~~~~~~~~~~~~~~
    // This should be the adapter's root directory

    // Define your own tests inside defineAdditionalTests
    defineAdditionalTests() {

        // Create mocks and asserts
        const { adapter, database } = utils.unit.createMocks({name: 'mydlink'});
        const { assertObjectExists } = utils.unit.createAsserts(database, adapter);

        describe("my test", () => {

            afterEach(() => {
                // The mocks keep track of all method invocations - reset them after each single test
                adapter.resetMockHistory();
                // We want to start each test with a fresh database
                database.clear();
            });

            it("works", () => {
                // Create an object in the fake db we will use in this test
                const theObject: ioBroker.PartialObject = {
                    _id: "whatever",
                    type: "state",
                    common: {
                        role: "whatever",
                    },
                };
                mocks.database.publishObject(theObject);

                // Do something that should be tested

                // Assert that the object still exists
                assertObjectExists(theObject._id);
            });

        });

    }
});
