const fs = require('fs');
const path = require('path');

const { KEY_VALUE_STORE_KEYS } = require('@apify/consts');
const command = require('@oclif/command');
const loadJson = require('load-json-file');

const { LOCAL_CONFIG_PATH } = require('../../src/lib/consts');
const { rimrafPromised } = require('../../src/lib/files');
const { getLocalKeyValueStorePath } = require('../../src/lib/utils');

const actName = 'my-act';

describe('apify create', () => {
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

    it('basic template structure with empty INPUT.json', async () => {
        const ACT_TEMPLATE = 'project_empty';
        const expectedInput = {};
        /* eslint-disable no-unused-expressions */
        await command.run(['create', actName, '--template', ACT_TEMPLATE, '--skip-dependency-install']);

        // Check that create command won't create the deprecated apify.json file
        // TODO: we can remove this later
        const apifyJsonPath = path.join(actName, 'apify.json');
        const actorJsonPath = path.join(actName, LOCAL_CONFIG_PATH);

        // check files structure
        expect(fs.existsSync(actName)).to.be.true;
        expect(fs.existsSync(path.join(actName, 'package.json'))).to.be.true;
        expect(fs.existsSync(apifyJsonPath)).to.be.false;
        expect(fs.existsSync(actorJsonPath)).to.be.true;
        expect(loadJson.sync(actorJsonPath).name).to.be.eql(actName);
        expect(fs.existsSync('storage')).to.be.false;
        expect(loadJson.sync(path.join(actName, getLocalKeyValueStorePath(), `${KEY_VALUE_STORE_KEYS.INPUT}.json`))).to.be.eql(expectedInput);
    });

    it('basic template structure with prefilled INPUT.json', async () => {
        const ACT_TEMPLATE = 'getting_started_typescript';
        const expectedInput = { url: 'https://www.apify.com' };

        /* eslint-disable no-unused-expressions */
        await command.run(['create', actName, '--template', ACT_TEMPLATE, '--skip-dependency-install']);

        // Check that create command won't create the deprecated apify.json file
        // TODO: we can remove this later
        const apifyJsonPath = path.join(actName, 'apify.json');
        const actorJsonPath = path.join(actName, LOCAL_CONFIG_PATH);

        // check files structure
        expect(fs.existsSync(actName)).to.be.true;
        expect(fs.existsSync(path.join(actName, 'package.json'))).to.be.true;
        expect(fs.existsSync(apifyJsonPath)).to.be.false;
        expect(fs.existsSync(actorJsonPath)).to.be.true;
        expect(loadJson.sync(actorJsonPath).name).to.be.eql(actName);
        expect(fs.existsSync('storage')).to.be.false;
        expect(loadJson.sync(path.join(actName, getLocalKeyValueStorePath(), `${KEY_VALUE_STORE_KEYS.INPUT}.json`))).to.be.eql(expectedInput);
    });

    afterEach(async () => {
        if (fs.existsSync(actName)) await rimrafPromised(actName);
    });
});
