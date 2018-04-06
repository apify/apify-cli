const { expect } = require('chai');
const fs = require('fs');
const sinon = require('sinon');
const command = require('@oclif/command');
const path = require('path');
const { rimrafPromised } = require('../../src/lib/files');
const loadJson = require('load-json-file');

const actName = 'my-act';
const ACT_TEMPLATE = 'basic';

describe('apify create', () => {
    beforeEach(() => {
        sinon.spy(console, 'log');
    });

    it('error with no argument', async () => {
        try {
            await command.run(['create']);
        } catch (err) {
            return;
        }
        throw new Error('Should have thrown an error');
    });

    it('basic template structure', async () => {
        await command.run(['create', actName, '--template', ACT_TEMPLATE]);

        const apifyJsonPath = path.join(actName, 'apify.json');
        // check files structure
        expect(fs.existsSync(actName)).to.be.true;
        expect(fs.existsSync(path.join(actName, 'package.json'))).to.be.true;
        expect(fs.existsSync(apifyJsonPath)).to.be.true;
        expect(loadJson.sync(apifyJsonPath).template).to.be.eql(ACT_TEMPLATE);
    });

    afterEach(() => {
        console.log.restore();
    });

    after(async () => {
        if (fs.existsSync(actName)) await rimrafPromised(actName);
    });
});
