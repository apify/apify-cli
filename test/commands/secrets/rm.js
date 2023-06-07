const { expect } = require('chai');
const command = require('@oclif/command');
const fs = require('fs');
const { GLOBAL_CONFIGS_FOLDER } = require('../../../src/lib/consts');
const { getSecretsFile } = require('../../../src/lib/secrets');
const { TEST_USER_TOKEN } = require('../config');

const SECRET_KEY = 'mySecret';

describe('apify secrets:rm', () => {
    let skipAfterHook = false;
    before(async () => {
        if (fs.existsSync(GLOBAL_CONFIGS_FOLDER)) {
            // Tests could break local environment if user is already logged in
            skipAfterHook = true;
            throw new Error(`Cannot run tests, directory ${GLOBAL_CONFIGS_FOLDER} exists! Run "apify logout" to fix this.`);
        }

        await command.run(['login', '--token', TEST_USER_TOKEN]);
        const secrets = getSecretsFile();
        if (!secrets[SECRET_KEY]) {
            await command.run(['secrets:add', SECRET_KEY, 'mySecretValue']);
        }
    });

    it('should work', async () => {
        await command.run(['secrets:rm', SECRET_KEY]);
        const secrets = getSecretsFile();
        expect(secrets[SECRET_KEY]).to.eql(undefined);
    });

    after(async () => {
        if (skipAfterHook) return;
        await command.run(['logout']);
    });
});
