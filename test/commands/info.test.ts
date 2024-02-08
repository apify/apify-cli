import { existsSync } from 'node:fs';

import { test } from '@oclif/test';
import { loadJsonFileSync } from 'load-json-file';

import { InfoCommand } from '../../src/commands/info.js';
import { LoginCommand } from '../../src/commands/login.js';
import { LogoutCommand } from '../../src/commands/logout.js';
import { AUTH_FILE_PATH } from '../../src/lib/consts.js';
import { TEST_USER_TOKEN } from '../__setup__/config.js';

describe('apify info', () => {
    let skipAfterHook = false;
    beforeAll(() => {
        if (existsSync(AUTH_FILE_PATH)) {
            // Tests could break local environment if user is already logged in
            skipAfterHook = true;
            throw new Error(`Cannot run tests, file ${AUTH_FILE_PATH} exists! Run "apify logout" to fix this.`);
        }
    });

    test
        .command(['info'])
        .catch(/./, { raiseIfNotThrown: true })
        .it('should end with Error when not logged in');

    it('should work when logged in', async () => {
        const spy = vitest.spyOn(console, 'log');

        await LoginCommand.run(['--token', TEST_USER_TOKEN], import.meta.url);
        await InfoCommand.run([], import.meta.url);

        const userInfoFromConfig = loadJsonFileSync<{ id: string }>(AUTH_FILE_PATH);

        expect(spy).toHaveBeenCalledTimes(3);
        expect(spy.mock.calls[2][0]).to.include(userInfoFromConfig.id);
    });

    afterAll(async () => {
        if (skipAfterHook) return;
        await LogoutCommand.run([], import.meta.url);
    });
});
