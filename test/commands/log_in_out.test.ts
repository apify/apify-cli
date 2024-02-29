import { existsSync } from 'node:fs';

import { loadJsonFileSync } from 'load-json-file';
import _ from 'underscore';

import { LoginCommand } from '../../src/commands/login.js';
import { LogoutCommand } from '../../src/commands/logout.js';
import { AUTH_FILE_PATH } from '../../src/lib/consts.js';
import { TEST_USER_BAD_TOKEN, TEST_USER_TOKEN, testUserClient } from '../__setup__/config.js';
import { useAuthSetup } from '../__setup__/hooks/useAuthSetup.js';

vitest.setConfig({ restoreMocks: false });
useAuthSetup();

describe('apify login and logout', () => {
    let spy: import('vitest').MockInstance<Parameters<typeof console['log']>, void>;

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
        const userInfoFromConfig = loadJsonFileSync(AUTH_FILE_PATH());

        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][0]).to.include('Success:');
        // Omit currentBillingPeriod, It can change during tests
        const floatFields = ['currentBillingPeriod', 'plan', 'createdAt'];
        expect(_.omit(expectedUserInfo, floatFields)).to.eql(_.omit(userInfoFromConfig, floatFields));

        await LogoutCommand.run([], import.meta.url);
        const isGlobalConfig = existsSync(AUTH_FILE_PATH());

        expect(isGlobalConfig).to.be.eql(false);
    });
});
