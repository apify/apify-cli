const { expect } = require('chai');
const fs = require('fs');
const sinon = require('sinon');
const loadJSON = require('load-json-file');
const create = require('../../cli/commands/create');
const logout = require('../../cli/commands/logout');
const { GLOBAL_CONFIGS_FOLDER, AUTH_FILE_PATH } = require('../../cli/lib/consts');
const utils = require('../../cli/lib/utils');

const credentials = { userId: 'myUserId', token: 'myToken' };
const badCredentials = { userId: 'badUserId', token: 'badToken'};

describe('apify create', () => {

    beforeEach(function() {
        sinon.spy(console, 'log');
    });


    it('error with no argument', async () => {
        await create({ _: [] });

        expect(console.log.callCount).to.eql(1);
        expect(console.log.args[0][0]).to.include('Error:');
    });

    it('basic template structure', async () => {
        const actName = 'my-act';
        await create({ _: [actName], template: 'basic' });

        expect(true).to.be.true;
    });


    afterEach(function() {
        console.log.restore();
    });

});
