const { expect } = require('chai');
const fs = require('fs');
const sinon = require('sinon');
const loadJson = require('load-json-file');
const command = require('@oclif/command');
const logout = require('../../cli/commands/logout');
const { GLOBAL_CONFIGS_FOLDER, AUTH_FILE_PATH } = require('../../cli/lib/consts');
const { apifyClient } = require('../../cli/lib/utils');

const userInfo = {
    userId: 'myUserId',
    proxy: {
        password: 'myProxyPass',
    }
};
const myUserToken = 'myToken';
const badCredentials = { userId: 'badUserId', token: 'badToken' };

const mockSuccessLogin = async (token) => {
    sinon.stub(apifyClient.users, 'getUser').withArgs({ token }).returns(userInfo);

    await command.run(['login', '--token', token]);

    apifyClient.users.getUser.restore();
};

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

    it('login should end with Error', async () => {
        await command.run(['login', '--token', badCredentials.token]);

        expect(console.log.callCount).to.eql(1);
        expect(console.log.args[0][0]).to.include('Error:');
    });

    it('login and logout should work', async () => {
        await mockSuccessLogin(myUserToken);

        const userInfoFromConfig = loadJson.sync(AUTH_FILE_PATH);

        expect(console.log.callCount).to.eql(1);
        expect(console.log.args[0][0]).to.include('Success:');
        expect(userInfoFromConfig).to.eql(Object.assign({ token: myUserToken }, userInfo));

        await command.run(['logout']);
        const isGlobalConfig = fs.existsSync(GLOBAL_CONFIGS_FOLDER);

        expect(isGlobalConfig).to.be.false;
    });

    afterEach(() => {
        console.log.restore();
    });
});
