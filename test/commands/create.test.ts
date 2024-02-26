import { existsSync } from 'node:fs';

import { KEY_VALUE_STORE_KEYS } from '@apify/consts';
import { test } from '@oclif/test';
import { loadJsonFileSync } from 'load-json-file';

import { LOCAL_CONFIG_PATH } from '../../src/lib/consts.js';
import { getLocalKeyValueStorePath } from '../../src/lib/utils.js';
import { useTempPath } from '../__setup__/hooks/useTempPath.js';

const actName = 'my-act';
const {
    beforeAllCalls,
    afterAllCalls,
    joinPath,
    toggleCwdBetweenFullAndParentPath,
    tmpPath,
} = useTempPath(actName, { create: true, remove: true, cwd: true, cwdParent: true });

const { CreateCommand } = await import('../../src/commands/create.js');

describe('apify create', () => {
    beforeEach(async () => {
        await beforeAllCalls();
    });

    afterEach(async () => {
        await afterAllCalls();
    });

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

        // check files structure
        expect(existsSync(tmpPath)).toBeTruthy();

        toggleCwdBetweenFullAndParentPath();

        // Check that create command won't create the deprecated apify.json file
        // TODO: we can remove this later
        const apifyJsonPath = joinPath('apify.json');
        const actorJsonPath = joinPath(LOCAL_CONFIG_PATH);

        expect(existsSync(joinPath('package.json'))).toBeTruthy();
        expect(existsSync(apifyJsonPath)).toBeFalsy();
        expect(existsSync(actorJsonPath)).toBeTruthy();
        expect(loadJsonFileSync<{ name: string }>(actorJsonPath).name).to.be.eql(actName);
        expect(loadJsonFileSync(joinPath(getLocalKeyValueStorePath(), `${KEY_VALUE_STORE_KEYS.INPUT}.json`))).to.be.eql(expectedInput);
    });

    it('basic template structure with prefilled INPUT.json', async () => {
        const ACT_TEMPLATE = 'getting_started_typescript';
        const expectedInput = { url: 'https://www.apify.com' };

        await CreateCommand.run([actName, '--template', ACT_TEMPLATE, '--skip-dependency-install'], import.meta.url);

        // check files structure
        expect(existsSync(tmpPath)).toBeTruthy();

        toggleCwdBetweenFullAndParentPath();

        // Check that create command won't create the deprecated apify.json file
        // TODO: we can remove this later
        const apifyJsonPath = joinPath('apify.json');
        const actorJsonPath = joinPath(LOCAL_CONFIG_PATH);

        expect(existsSync(joinPath('package.json'))).toBeTruthy();
        expect(existsSync(apifyJsonPath)).toBeFalsy();
        expect(existsSync(actorJsonPath)).toBeTruthy();
        expect(loadJsonFileSync<{ name: string }>(actorJsonPath)!.name).to.be.eql(actName);
        expect(loadJsonFileSync(joinPath(getLocalKeyValueStorePath(), `${KEY_VALUE_STORE_KEYS.INPUT}.json`))).to.be.eql(expectedInput);
    });
});
