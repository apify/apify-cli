const { expect } = require('chai');
const fs = require('fs');
const sinon = require('sinon');
const command = require('@oclif/command');
const path = require('path');
const { rimrafPromised } = require('../../cli/lib/files');

const actName = 'my-act';

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
        await command.run(['create', actName, '--template', 'basic']);

        // check files structure
        expect(fs.existsSync(actName)).to.be.true;
        expect(fs.existsSync(path.join(actName, 'package.json'))).to.be.true;
        expect(fs.existsSync(path.join(actName, 'apify.json'))).to.be.true;
    });

    afterEach(() => {
        console.log.restore();
    });

    after(async () => {
        if (fs.existsSync(actName)) await rimrafPromised(actName);
    });
});
