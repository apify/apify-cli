import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { KEY_VALUE_STORE_KEYS } from '@apify/consts';
import { loadJsonFileSync } from 'load-json-file';
import { writeJsonFile } from 'write-json-file';

import { InitCommand } from '../../src/commands/init.js';
import { EMPTY_LOCAL_CONFIG, LOCAL_CONFIG_PATH } from '../../src/lib/consts.js';
import { rimrafPromised } from '../../src/lib/files.js';
import { getLocalKeyValueStorePath } from '../../src/lib/utils.js';

const actName = 'my-act-init';

describe('apify init', () => {
    beforeEach(() => {
        // create folder for init project
        mkdirSync(actName);
        process.chdir(actName);
    });

    it('correctly creates basic structure with empty INPUT.json', async () => {
        await InitCommand.run(['-y', actName], import.meta.url);

        // Check that it won't create deprecated config
        // TODO: We can remove this later
        const apifyJsonPath = 'apify.json';
        expect(existsSync(apifyJsonPath)).to.be.eql(false);

        expect(loadJsonFileSync(LOCAL_CONFIG_PATH)).to.be.eql(Object.assign(EMPTY_LOCAL_CONFIG, { name: actName }));
        expect(loadJsonFileSync(join(getLocalKeyValueStorePath(), `${KEY_VALUE_STORE_KEYS.INPUT}.json`))).to.be.eql({});
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
        await InitCommand.run(['-y', actName], import.meta.url);

        // Check that it won't create deprecated config
        // TODO: We can remove this later
        const apifyJsonPath = 'apify.json';
        expect(existsSync(apifyJsonPath)).to.be.eql(false);
        expect(loadJsonFileSync(LOCAL_CONFIG_PATH)).to.be.eql(defaultActorJson);
        expect(loadJsonFileSync(join(getLocalKeyValueStorePath(), `${KEY_VALUE_STORE_KEYS.INPUT}.json`))).to.be.eql({ url: 'https://www.apify.com/' });
    });

    afterEach(async () => {
        process.chdir('../');
        if (existsSync(actName)) await rimrafPromised(actName);
    });
});
