const fs = require('fs');

const command = require('@oclif/command');
const loadJson = require('load-json-file');
const _ = require('underscore');

const { testUserClient, TEST_USER_TOKEN, TEST_USER_BAD_TOKEN } = require('./config');
const { GLOBAL_CONFIGS_FOLDER, AUTH_FILE_PATH } = require('../../src/lib/consts');

vitest.setConfig({ restoreMocks: false });

describe('apify login and logout', () => {
    let skipAfterHook = false;

    /** @type {import('vitest').MockInstance<[message?: any, ...optionalParameters: any[]], void>} */
    let spy;

    beforeAll(() => {
        if (fs.existsSync(AUTH_FILE_PATH)) {
            // Tests could break local environment if user is already logged in
            skipAfterHook = true;
            throw new Error(`Cannot run tests, file ${AUTH_FILE_PATH} exists! Run "apify logout" to fix this.`);
        }
    });

    beforeEach(() => {
        spy = vitest.spyOn(console, 'log');
    });

    it('should end with Error with bad token', async () => {
        await command.run(['login', '--token', TEST_USER_BAD_TOKEN]);

        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][0]).to.include('Error:');
    });

    it('should work with correct token', async () => {
        await command.run(['login', '--token', TEST_USER_TOKEN]);

        const expectedUserInfo = Object.assign(await testUserClient.user('me').get(), { token: TEST_USER_TOKEN });
        const userInfoFromConfig = loadJson.sync(AUTH_FILE_PATH);

        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][0]).to.include('Success:');
        // Omit currentBillingPeriod, It can change during tests
        const floatFields = ['currentBillingPeriod', 'plan', 'createdAt'];
        expect(_.omit(expectedUserInfo, floatFields)).to.eql(_.omit(userInfoFromConfig, floatFields));

        await command.run(['logout']);
        const isGlobalConfig = fs.existsSync(AUTH_FILE_PATH);

        expect(isGlobalConfig).to.be.eql(false);
    });

    afterEach(() => {
        spy.mockRestore();
    });

    afterAll(() => {
        if (skipAfterHook) return;
        fs.rmSync(GLOBAL_CONFIGS_FOLDER, { recursive: true, force: true });
    });
});
