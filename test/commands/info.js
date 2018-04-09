const { expect } = require('chai');
const sinon = require('sinon');
const fs = require('fs');
const loadJson = require('load-json-file');
const { GLOBAL_CONFIGS_FOLDER, AUTH_FILE_PATH } = require('../../src/lib/consts');
const command = require('@oclif/command');
const { testUserClient } = require('./config');

describe('apify info', () => {
    before(function () {
        if (fs.existsSync(GLOBAL_CONFIGS_FOLDER)) {
            // Skip tests if user used CLI on local, it can break local environment!
            this.skip();
        }
    });

    beforeEach(() => {
        sinon.spy(console, 'log');
    });

    it('info should end with Error', async () => {
        try {
            await command.run(['info']);
        } catch (e) {
            expect(e).to.be.an('error');
        }
    });

    it('info should work', async () => {
        const { token } = testUserClient.getOptions();
        await command.run(['login', '--token', token]);
        await command.run(['info']);

        const userInfoFromConfig = loadJson.sync(AUTH_FILE_PATH);

        expect(console.log.callCount).to.eql(5);
        expect(console.log.args[2][0]).to.include(userInfoFromConfig.id);

        await command.run(['logout']);
    });

    afterEach(() => {
        console.log.restore();
    });
});
