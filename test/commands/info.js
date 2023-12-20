const fs = require('fs');

const command = require('@oclif/command');
const loadJson = require('load-json-file');

const { TEST_USER_TOKEN } = require('./config');
const { AUTH_FILE_PATH } = require('../../src/lib/consts');

describe('apify info', () => {
    let skipAfterHook = false;
    beforeAll(() => {
        if (fs.existsSync(AUTH_FILE_PATH)) {
            // Tests could break local environment if user is already logged in
            skipAfterHook = true;
            throw new Error(`Cannot run tests, file ${AUTH_FILE_PATH} exists! Run "apify logout" to fix this.`);
        }
    });

    it('should end with Error when not logged in', async () => {
        try {
            await command.run(['info']);
        } catch (e) {
            expect(e).to.be.an('error');
        }
    });

    it('should work when logged in', async () => {
        const spy = vitest.spyOn(console, 'log');

        await command.run(['login', '--token', TEST_USER_TOKEN]);
        await command.run(['info']);

        const userInfoFromConfig = loadJson.sync(AUTH_FILE_PATH);

        expect(spy).toHaveBeenCalledTimes(3);
        expect(spy.mock.calls[2][0]).to.include(userInfoFromConfig.id);
    });

    afterAll(async () => {
        if (skipAfterHook) return;
        await command.run(['logout']);
    });
});
