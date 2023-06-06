const { expect } = require('chai');
const sinon = require('sinon');
const fs = require('fs');
const loadJson = require('load-json-file');
const command = require('@oclif/command');
const { GLOBAL_CONFIGS_FOLDER, AUTH_FILE_PATH } = require('../../src/lib/consts');
const { TEST_USER_TOKEN } = require('./config');

describe('apify info', () => {
    let skipAfterHook = false;
    before(() => {
        if (fs.existsSync(GLOBAL_CONFIGS_FOLDER)) {
            // Tests could break local environment if user is already logged in
            skipAfterHook = true;
            throw new Error(`Cannot run tests, directory ${GLOBAL_CONFIGS_FOLDER} exists! Run "apify logout" to fix this.`);
        }
    });

    beforeEach(() => {
        sinon.spy(console, 'log');
    });

    it('should end with Error when not logged in', async () => {
        try {
            await command.run(['info']);
        } catch (e) {
            expect(e).to.be.an('error');
        }
    });

    it('should work when logged in', async () => {
        await command.run(['login', '--token', TEST_USER_TOKEN]);
        await command.run(['info']);

        const userInfoFromConfig = loadJson.sync(AUTH_FILE_PATH);

        expect(console.log.callCount).to.eql(3);
        expect(console.log.args[2][0]).to.include(userInfoFromConfig.id);
    });

    afterEach(() => {
        console.log.restore();
    });

    after(async () => {
        if (skipAfterHook) return;
        await command.run(['logout']);
    });
});
