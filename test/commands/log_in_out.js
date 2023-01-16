const { expect } = require('chai');
const fs = require('fs');
const _ = require('underscore');
const sinon = require('sinon');
const loadJson = require('load-json-file');
const command = require('@oclif/command');
const { GLOBAL_CONFIGS_FOLDER, AUTH_FILE_PATH } = require('../../src/lib/consts');
const { testUserClient, TEST_USER_TOKEN, TEST_USER_BAD_TOKEN } = require('./config');

describe('apify login and logout', () => {
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
        await command.run(['login', '--token', TEST_USER_BAD_TOKEN]);

        expect(console.log.callCount).to.eql(1);
        expect(console.log.args[0][0]).to.include('Error:');
    });

    it('should work', async () => {
        await command.run(['login', '--token', TEST_USER_TOKEN]);

        const expectedUserInfo = Object.assign(await testUserClient.user('me').get(), { token: TEST_USER_TOKEN });
        const userInfoFromConfig = loadJson.sync(AUTH_FILE_PATH);

        expect(console.log.callCount).to.eql(1);
        expect(console.log.args[0][0]).to.include('Success:');
        // Omit currentBillingPeriod, It can change during tests
        const floatFields = ['currentBillingPeriod', 'plan', 'createdAt'];
        expect(_.omit(expectedUserInfo, floatFields)).to.eql(_.omit(userInfoFromConfig, floatFields));

        await command.run(['logout']);
        const isGlobalConfig = fs.existsSync(GLOBAL_CONFIGS_FOLDER);

        expect(isGlobalConfig).to.be.eql(false);
    });

    afterEach(() => {
        console.log.restore();
    });
});
