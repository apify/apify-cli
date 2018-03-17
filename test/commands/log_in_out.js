const { expect } = require('chai');
const fs = require('fs');
const sinon = require('sinon');
const loadJSON = require('load-json-file');
const login = require('../../cli/commands/login');
const logout = require('../../cli/commands/logout');
const { GLOBAL_CONFIGS_FOLDER, AUTH_FILE_PATH } = require('../../cli/lib/consts');
const utils = require('../../cli/lib/utils');

const mockSuccessLogin = async (credentials) => {
    sinon.stub(utils, 'getLoggedClient')
    .withArgs(credentials)
    .returns(true);
    await login(credentials);
    utils.getLoggedClient.restore();
};

const credentials = { userId: 'myUserId', token: 'myToken' };
const badCredentials = { userId: 'badUserId', token: 'badToken' };

describe('apify login and logout', () => {

    before(function () {
        if (fs.existsSync(GLOBAL_CONFIGS_FOLDER)) {
            // Skip tests if user used CLI on local, it can break local environment!
            this.skip();
        }
    });

    beforeEach(function () {
        sinon.spy(console, 'log');
    });

    it('login should end with Error', async () => {
        await login(badCredentials);

        expect(console.log.callCount)
        .to
        .eql(1);
        expect(console.log.args[0][0])
        .to
        .include('Error:');
    });

    it('login should work', async () => {

        await mockSuccessLogin(credentials);

        const credetialsFromConfig = loadJSON.sync(AUTH_FILE_PATH);

        expect(console.log.callCount)
        .to
        .eql(1);
        expect(console.log.args[0][0])
        .to
        .include('Success:');
        expect(credetialsFromConfig)
        .to
        .eql(credentials);

        await logout();
    });

    it('logout should work', async () => {
        await mockSuccessLogin(credentials);

        await logout();

        const isGlobalConfig = fs.existsSync(GLOBAL_CONFIGS_FOLDER);
        expect(isGlobalConfig).to.be.false;
    });

    afterEach(function () {
        console.log.restore();
    });
});
