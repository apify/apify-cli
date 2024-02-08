import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { KEY_VALUE_STORE_KEYS } from '@apify/consts';
import { test } from '@oclif/test';
import { loadJsonFileSync } from 'load-json-file';

import { CreateCommand } from '../../src/commands/create.js';
import { LOCAL_CONFIG_PATH } from '../../src/lib/consts.js';
import { rimrafPromised } from '../../src/lib/files.js';
import { getLocalKeyValueStorePath } from '../../src/lib/utils.js';

const actName = 'my-act';

describe('apify create', () => {
    ['a'.repeat(151), 'sh', 'bad_escaped'].forEach((badActorName) => {
        test
            .command(['create', badActorName])
            // We want to ensure any error is thrown, we don't care about the error message (but maybe we should)
            .catch(/./, { raiseIfNotThrown: true })
            .it(`returns error with bad actor name ${badActorName}`);
    });

    it('basic template structure with empty INPUT.json', async () => {
        const ACT_TEMPLATE = 'project_empty';
        const expectedInput = {};
        await CreateCommand.run([actName, '--template', ACT_TEMPLATE, '--skip-dependency-install'], import.meta.url);

        // Check that create command won't create the deprecated apify.json file
        // TODO: we can remove this later
        const apifyJsonPath = join(actName, 'apify.json');
        const actorJsonPath = join(actName, LOCAL_CONFIG_PATH);

        // check files structure
        expect(existsSync(actName)).toBeTruthy();
        expect(existsSync(join(actName, 'package.json'))).toBeTruthy();
        expect(existsSync(apifyJsonPath)).toBeFalsy();
        expect(existsSync(actorJsonPath)).toBeTruthy();
        expect(loadJsonFileSync<{ name: string }>(actorJsonPath).name).to.be.eql(actName);
        expect(existsSync('storage')).toBeFalsy();
        expect(loadJsonFileSync(join(actName, getLocalKeyValueStorePath(), `${KEY_VALUE_STORE_KEYS.INPUT}.json`))).to.be.eql(expectedInput);
    });

    it('basic template structure with prefilled INPUT.json', async () => {
        const ACT_TEMPLATE = 'getting_started_typescript';
        const expectedInput = { url: 'https://www.apify.com' };

        await CreateCommand.run([actName, '--template', ACT_TEMPLATE, '--skip-dependency-install'], import.meta.url);

        // Check that create command won't create the deprecated apify.json file
        // TODO: we can remove this later
        const apifyJsonPath = join(actName, 'apify.json');
        const actorJsonPath = join(actName, LOCAL_CONFIG_PATH);

        // check files structure
        expect(existsSync(actName)).toBeTruthy();
        expect(existsSync(join(actName, 'package.json'))).toBeTruthy();
        expect(existsSync(apifyJsonPath)).toBeFalsy();
        expect(existsSync(actorJsonPath)).toBeTruthy();
        expect(loadJsonFileSync<{ name: string }>(actorJsonPath)!.name).to.be.eql(actName);
        expect(existsSync('storage')).toBeFalsy();
        expect(loadJsonFileSync(join(actName, getLocalKeyValueStorePath(), `${KEY_VALUE_STORE_KEYS.INPUT}.json`))).to.be.eql(expectedInput);
    });

    afterEach(async () => {
        if (existsSync(actName)) await rimrafPromised(actName);
    });
});
