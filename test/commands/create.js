const { expect } = require('chai');
const fs = require('fs');
const sinon = require('sinon');
const create = require('../../cli/commands-old/create');
const path = require('path');
const { rimrafPromised } = require('../../cli/lib/files');

const actName = 'my-act';

describe('apify create', () => {
    beforeEach(() => {
        sinon.spy(console, 'log');
    });

    it('error with no argument', async () => {
        await create({ _: [] });

        expect(console.log.callCount).to.eql(1);
        expect(console.log.args[0][0]).to.include('Error:');
    });

    it('basic template structure', async () => {
        await create({ _: [actName], template: 'basic' });

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
