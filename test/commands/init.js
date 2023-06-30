const { expect } = require('chai');
const fs = require('fs');
const command = require('@oclif/command');
const loadJson = require('load-json-file');
const path = require('path');
const { KEY_VALUE_STORE_KEYS } = require('@apify/consts');
const writeJsonFile = require('write-json-file');
const { rimrafPromised } = require('../../src/lib/files');
const { EMPTY_LOCAL_CONFIG, LOCAL_CONFIG_PATH } = require('../../src/lib/consts');
const { getLocalKeyValueStorePath } = require('../../src/lib/utils');

const actName = 'my-act-init';

describe('apify init', () => {
    beforeEach(() => {
        // create folder for init project
        fs.mkdirSync(actName);
        process.chdir(actName);
    });

    it('correctly creates basic structure', async () => {
        await command.run(['init', actName]);

        // Check that it won't create deprecated config
        // TODO: We can remove this later
        const apifyJsonPath = 'apify.json';
        expect(fs.existsSync(apifyJsonPath)).to.be.eql(false);

        expect(loadJson.sync(LOCAL_CONFIG_PATH)).to.be.eql(Object.assign(EMPTY_LOCAL_CONFIG, { name: actName }));
    });

    it('correctly creates structure with prefilled INPUT.json', async () => {
        const input = {
            title: 'Scrape data from a web page',
            type: 'object',
            schemaVersion: 1,
            properties: {
                url: {
                    title: 'URL of the page',
                    type: 'string',
                    description: 'The URL of website you want to get the data from.',
                    editor: 'textfield',
                    prefill: 'https://www.apify.com/',
                },
            },
            required: ['url'],
        };
        const defaultActorJson = Object.assign(EMPTY_LOCAL_CONFIG, { name: actName, input });

        await writeJsonFile('.actor/actor.json', defaultActorJson);
        await command.run(['init', actName]);

        // Check that it won't create deprecated config
        // TODO: We can remove this later
        const apifyJsonPath = 'apify.json';
        expect(fs.existsSync(apifyJsonPath)).to.be.eql(false);
        expect(loadJson.sync(LOCAL_CONFIG_PATH)).to.be.eql(defaultActorJson);
        expect(loadJson.sync(path.join(getLocalKeyValueStorePath(), `${KEY_VALUE_STORE_KEYS.INPUT}.json`))).to.be.eql({ url: 'https://www.apify.com/' });
    });

    afterEach(async () => {
        process.chdir('../');
        if (fs.existsSync(actName)) await rimrafPromised(actName);
    });
});
