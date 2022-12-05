const { expect } = require('chai');
const fs = require('fs');
const sinon = require('sinon');
const command = require('@oclif/command');
const path = require('path');
const loadJson = require('load-json-file');
const { rimrafPromised } = require('../../src/lib/files');
const { getLocalKeyValueStorePath } = require('../../src/lib/utils');
const { LOCAL_CONFIG_PATH } = require('../../src/lib/consts');

const actName = 'my-act';
const ACT_TEMPLATE = 'project_empty';

describe('apify create', () => {
    beforeEach(() => {
        sinon.spy(console, 'log');
    });

    ['a'.repeat(151), 'sh', 'bad_escaped'].forEach((badActorName) => {
        it(`returns error with bad actor name ${badActorName}`, async () => {
            try {
                await command.run(['create', badActorName]);
            } catch (err) {
                return;
            }
            throw new Error('Should have thrown an error');
        });
    });

    it('basic template structure', async () => {
        /* eslint-disable no-unused-expressions */
        await command.run(['create', actName, '--template', ACT_TEMPLATE]);

        // Check that create command won't create the deprecated apify.json file
        // TODO: we can remove this later
        const apifyJsonPath = path.join(actName, 'apify.json');
        const actorJsonPath = path.join(actName, LOCAL_CONFIG_PATH);

        // check files structure
        expect(fs.existsSync(actName)).to.be.true;
        expect(fs.existsSync(path.join(actName, 'package.json'))).to.be.true;
        expect(fs.existsSync(apifyJsonPath)).to.be.false;
        expect(fs.existsSync(actorJsonPath)).to.be.true;
        expect(fs.existsSync(path.join(actName, getLocalKeyValueStorePath(), 'INPUT.json'))).to.be.true;
        expect(loadJson.sync(actorJsonPath).name).to.be.eql(actName);
        expect(fs.existsSync('storage')).to.be.false;
    });

    afterEach(() => {
        console.log.restore();
    });

    after(async () => {
        if (fs.existsSync(actName)) await rimrafPromised(actName);
    });
});
