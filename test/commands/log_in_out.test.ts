import { existsSync, rmSync } from 'node:fs';

import { loadJsonFileSync } from 'load-json-file';
import _ from 'underscore';

import { LoginCommand } from '../../src/commands/login.js';
import { LogoutCommand } from '../../src/commands/logout.js';
import { AUTH_FILE_PATH, GLOBAL_CONFIGS_FOLDER } from '../../src/lib/consts.js';
import { TEST_USER_BAD_TOKEN, TEST_USER_TOKEN, testUserClient } from '../__setup__/config.js';

vitest.setConfig({ restoreMocks: false });

describe('apify login and logout', () => {
    let skipAfterHook = false;

    let spy: import('vitest').MockInstance<[message?: unknown, ...optionalParameters: unknown[]], void>;

    beforeAll(() => {
        if (existsSync(AUTH_FILE_PATH)) {
            // Tests could break local environment if user is already logged in
            skipAfterHook = true;
            throw new Error(`Cannot run tests, file ${AUTH_FILE_PATH} exists! Run "apify logout" to fix this.`);
        }
    });

    beforeEach(() => {
        spy = vitest.spyOn(console, 'log');
    });

    it('should end with Error with bad token', async () => {
        await LoginCommand.run(['--token', TEST_USER_BAD_TOKEN], import.meta.url);

        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][0]).to.include('Error:');
    });

    it('should work with correct token', async () => {
        await LoginCommand.run(['--token', TEST_USER_TOKEN], import.meta.url);

        const expectedUserInfo = Object.assign(await testUserClient.user('me').get(), { token: TEST_USER_TOKEN });
        const userInfoFromConfig = loadJsonFileSync(AUTH_FILE_PATH);

        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][0]).to.include('Success:');
        // Omit currentBillingPeriod, It can change during tests
        const floatFields = ['currentBillingPeriod', 'plan', 'createdAt'];
        expect(_.omit(expectedUserInfo, floatFields)).to.eql(_.omit(userInfoFromConfig, floatFields));

        await LogoutCommand.run([], import.meta.url);
        const isGlobalConfig = existsSync(AUTH_FILE_PATH);

        expect(isGlobalConfig).to.be.eql(false);
    });

    afterEach(() => {
        spy.mockRestore();
    });

    afterAll(() => {
        if (skipAfterHook) return;
        rmSync(GLOBAL_CONFIGS_FOLDER, { recursive: true, force: true });
    });
});
