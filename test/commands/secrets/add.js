const { expect } = require('chai');
const command = require('@oclif/command');
const fs = require('fs');
const { GLOBAL_CONFIGS_FOLDER } = require('../../../src/lib/consts');
const { getSecretsFile } = require('../../../src/lib/secrets');
const { testUserClient } = require('../config');

const SECRET_KEY = 'mySecret';
const SECRET_VALUE = 'mySecretValue';

describe('apify secrets:add', () => {
    before(async function () {
        if (fs.existsSync(GLOBAL_CONFIGS_FOLDER)) {
            // Skip tests if user used CLI on local, it can break local environment!
            this.skip();
        }
        const { token } = testUserClient.getOptions();
        await command.run(['login', '--token', token]);
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

    after(async () => {
        const secrets = getSecretsFile();
        if (secrets[SECRET_KEY]) {
            await command.run(['secrets:rm', SECRET_KEY]);
        }
        await command.run(['logout']);
    });
});
