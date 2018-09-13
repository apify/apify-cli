const { expect } = require('chai');
const fs = require('fs');
const _ = require('underscore');
const sinon = require('sinon');
const loadJson = require('load-json-file');
const command = require('@oclif/command');
const { GLOBAL_CONFIGS_FOLDER, AUTH_FILE_PATH } = require('../../src/lib/consts');
const { testUserClient, badUserClient } = require('./config');

describe('apify login and logout', () => {
    before(function () {
        if (fs.existsSync(GLOBAL_CONFIGS_FOLDER)) {
            // Skip tests if user used CLI on local, it can break local environment!
            this.skip();
        }
    });

    beforeEach(() => {
        sinon.spy(console, 'log');
    });

    it('should end with Error', async () => {
        const { token } = badUserClient.getOptions();
        await command.run(['login', '--token', token]);

        expect(console.log.callCount).to.eql(1);
        expect(console.log.args[0][0]).to.include('Error:');
    });

    it('should work', async () => {
        const { token } = testUserClient.getOptions();
        await command.run(['login', '--token', token]);

        const expectedUserInfo = Object.assign(await testUserClient.users.getUser(), { token });
        const userInfoFromConfig = loadJson.sync(AUTH_FILE_PATH);

        expect(console.log.callCount).to.eql(1);
        expect(console.log.args[0][0]).to.include('Success:');
        // Omit currentBillingPeriod, It can change during tests
        expect(_.omit(expectedUserInfo, 'currentBillingPeriod')).to.eql(_.omit(userInfoFromConfig, 'currentBillingPeriod'));

        await command.run(['logout']);
        const isGlobalConfig = fs.existsSync(GLOBAL_CONFIGS_FOLDER);

        expect(isGlobalConfig).to.be.false;
    });

    afterEach(() => {
        console.log.restore();
    });
});
