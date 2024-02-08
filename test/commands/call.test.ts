/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ACTOR_JOB_STATUSES } from '@apify/consts';
import { ApifyClient } from 'apify-client';

import { CallCommand } from '../../src/commands/call.js';
import { CreateCommand } from '../../src/commands/create.js';
import { LoginCommand } from '../../src/commands/login.js';
import { LogoutCommand } from '../../src/commands/logout.js';
import { PushCommand } from '../../src/commands/push.js';
import { AUTH_FILE_PATH } from '../../src/lib/consts.js';
import { rimrafPromised } from '../../src/lib/files.js';
import { getLocalKeyValueStorePath } from '../../src/lib/utils.js';
import { TEST_USER_TOKEN, testUserClient } from '../__setup__/config.js';

const ACTOR_NAME = `my-act-${Date.now()}`;
const EXPECTED_OUTPUT = {
    test: Math.random(),
};
const EXPECTED_INPUT = {
    myTestInput: Math.random(),
};
const EXPECTED_INPUT_CONTENT_TYPE = 'application/json';

/**
 * Waits for the build to finish
 */
const waitForBuildToFinish = async (client: ApifyClient, buildId: string) => {
    while (true) { // eslint-disable-line
        const build = await client.build(buildId).get();
        if (build!.status !== ACTOR_JOB_STATUSES.RUNNING as any) return build;
        await new Promise((resolve) => setTimeout(resolve, 2500));
    }
};

/**
 * Waits for build to finish with timeout, throws an error on timeout
 */
const waitForBuildToFinishWithTimeout = async (client: ApifyClient, buildId: string, timeoutSecs = 60) => {
    const buildPromise = waitForBuildToFinish(client, buildId);
    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(false), timeoutSecs * 1000));
    const result = await Promise.race([buildPromise, timeoutPromise]);
    if (!result) throw new Error(`Timed out after ${timeoutSecs} seconds`);
};

describe('apify call', () => {
    let actorId: string;

    let skipAfterHook = false;
    beforeAll(async () => {
        if (existsSync(AUTH_FILE_PATH)) {
            // Tests could break local environment if user is already logged in
            skipAfterHook = true;
            throw new Error(`Cannot run tests, file ${AUTH_FILE_PATH} exists! Run "apify logout" to fix this.`);
        }

        const { username } = await testUserClient.user('me').get();

        await LoginCommand.run(['--token', TEST_USER_TOKEN], import.meta.url);
        await CreateCommand.run([ACTOR_NAME, '--template', 'project_empty', '--skip-dependency-install'], import.meta.url);

        process.chdir(ACTOR_NAME);
        const actCode = `
        import { Actor } from 'apify';

        Actor.main(async () => {
            await Actor.setValue('OUTPUT', ${JSON.stringify(EXPECTED_OUTPUT)});
            console.log('Done.');
        });
        `;
        writeFileSync('src/main.js', actCode, { flag: 'w' });

        const inputFile = join(getLocalKeyValueStorePath(), 'INPUT.json');

        writeFileSync(inputFile, JSON.stringify(EXPECTED_INPUT), { flag: 'w' });

        await PushCommand.run(['--no-prompt'], import.meta.url);

        actorId = `${username}/${ACTOR_NAME}`;

        // Build must finish before doing `apify call`, otherwise we would get nonexisting build with "LATEST" tag error.
        const builds = await testUserClient.actor(actorId).builds().list();
        const lastBuild = builds.items.pop();
        await waitForBuildToFinishWithTimeout(testUserClient, lastBuild!.id);
    });

    it('without actId', async () => {
        await CallCommand.run([], import.meta.url);
        const actorClient = testUserClient.actor(actorId);
        const runs = await actorClient.runs().list();
        const lastRun = runs.items.pop();
        const lastRunDetail = await testUserClient.run(lastRun!.id).get();
        const output = await testUserClient.keyValueStore(lastRunDetail!.defaultKeyValueStoreId).getRecord('OUTPUT');
        const input = await testUserClient.keyValueStore(lastRunDetail!.defaultKeyValueStoreId).getRecord('INPUT');

        expect(EXPECTED_OUTPUT).to.be.eql(output!.value);
        expect(EXPECTED_INPUT).to.be.eql(input!.value);
        expect(EXPECTED_INPUT_CONTENT_TYPE).to.be.eql(input!.contentType);
    });

    afterAll(async () => {
        if (skipAfterHook) return;
        await testUserClient.actor(actorId).delete();
        process.chdir('../');
        if (existsSync(ACTOR_NAME)) await rimrafPromised(ACTOR_NAME);
        await LogoutCommand.run([], import.meta.url);
    });
});
