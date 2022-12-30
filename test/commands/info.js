const { expect } = require('chai');
const sinon = require('sinon');
const fs = require('fs');
const loadJson = require('load-json-file');
const command = require('@oclif/command');
const { GLOBAL_CONFIGS_FOLDER, AUTH_FILE_PATH } = require('../../src/lib/consts');
const { TEST_USER_TOKEN } = require('./config');

describe('apify info', () => {
    before(function () {
        if (fs.existsSync(GLOBAL_CONFIGS_FOLDER)) {
            // Skip tests if user used CLI on local, it can break local environment!
            console.warn(`Test was skipped as directory ${GLOBAL_CONFIGS_FOLDER} exists!`);
            this.skip();
        }
    });

    beforeEach(() => {
        sinon.spy(console, 'log');
    });

    it('should end with Error', async () => {
        try {
            await command.run(['info']);
        } catch (e) {
            expect(e).to.be.an('error');
        }
    });

    it('should work', async () => {
        await command.run(['login', '--token', TEST_USER_TOKEN]);
        await command.run(['info']);

        const userInfoFromConfig = loadJson.sync(AUTH_FILE_PATH);

        expect(console.log.callCount).to.eql(3);
        expect(console.log.args[2][0]).to.include(userInfoFromConfig.id);

        await command.run(['logout']);
    });

    afterEach(() => {
        console.log.restore();
    });
});
