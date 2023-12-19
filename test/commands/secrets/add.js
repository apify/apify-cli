const fs = require('fs');

const command = require('@oclif/command');

const { AUTH_FILE_PATH } = require('../../../src/lib/consts');
const { getSecretsFile } = require('../../../src/lib/secrets');
const { TEST_USER_TOKEN } = require('../config');

const SECRET_KEY = 'mySecret';
const SECRET_VALUE = 'mySecretValue';

describe('apify secrets:add', () => {
    let skipAfterHook = false;
    beforeAll(async () => {
        if (fs.existsSync(AUTH_FILE_PATH)) {
            // Tests could break local environment if user is already logged in
            skipAfterHook = true;
            throw new Error(`Cannot run tests, file ${AUTH_FILE_PATH} exists! Run "apify logout" to fix this.`);
        }

        await command.run(['login', '--token', TEST_USER_TOKEN]);
        const secrets = getSecretsFile();
        if (secrets[SECRET_KEY]) {
            await command.run(['secrets:rm', SECRET_KEY]);
        }
    });

    it('should work', async () => {
        await command.run(['secrets:add', SECRET_KEY, SECRET_VALUE]);
        const secrets = getSecretsFile();
        expect(secrets[SECRET_KEY]).to.eql(SECRET_VALUE);
    });

    afterAll(async () => {
        if (skipAfterHook) return;
        const secrets = getSecretsFile();
        if (secrets[SECRET_KEY]) {
            await command.run(['secrets:rm', SECRET_KEY]);
        }
        await command.run(['logout']);
    });
});
