/* eslint-disable @typescript-eslint/no-explicit-any */
import { writeFileSync } from 'node:fs';
import { platform } from 'node:os';

import { ACTOR_JOB_STATUSES } from '@apify/consts';
import { cryptoRandomObjectId } from '@apify/utilities';
import { ApifyClient } from 'apify-client';

import { LoginCommand } from '../../src/commands/login.js';
import { getLocalKeyValueStorePath } from '../../src/lib/utils.js';
import { TEST_USER_TOKEN, testUserClient } from '../__setup__/config.js';
import { useAuthSetup } from '../__setup__/hooks/useAuthSetup.js';
import { useTempPath } from '../__setup__/hooks/useTempPath.js';

const ACTOR_NAME = `call-my-actor-${cryptoRandomObjectId(6)}-${process.version.split('.')[0]}-${platform()}`;
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

useAuthSetup({ perTest: false });

const {
    beforeAllCalls,
    afterAllCalls,
    joinPath,
    toggleCwdBetweenFullAndParentPath,
} = useTempPath(ACTOR_NAME, { cwd: true, cwdParent: true, create: true, remove: true });

const { CreateCommand } = await import('../../src/commands/create.js');
const { PushCommand } = await import('../../src/commands/push.js');
const { CallCommand } = await import('../../src/commands/call.js');

describe('apify call', () => {
    let actorId: string;

    beforeAll(async () => {
        await beforeAllCalls();

        const { username } = await testUserClient.user('me').get();

        await LoginCommand.run(['--token', TEST_USER_TOKEN], import.meta.url);
        await CreateCommand.run([ACTOR_NAME, '--template', 'project_empty', '--skip-dependency-install'], import.meta.url);

        const actCode = `
        import { Actor } from 'apify';

        Actor.main(async () => {
            await Actor.setValue('OUTPUT', ${JSON.stringify(EXPECTED_OUTPUT)});
            console.log('Done.');
        });
        `;
        writeFileSync(joinPath('src/main.js'), actCode, { flag: 'w' });

        const inputFile = joinPath(getLocalKeyValueStorePath(), 'INPUT.json');

        writeFileSync(inputFile, JSON.stringify(EXPECTED_INPUT), { flag: 'w' });

        toggleCwdBetweenFullAndParentPath();

        await PushCommand.run(['--no-prompt', '--force'], import.meta.url);

        actorId = `${username}/${ACTOR_NAME}`;

        // Build must finish before doing `apify call`, otherwise we would get nonexisting build with "LATEST" tag error.
        const builds = await testUserClient.actor(actorId).builds().list();
        const lastBuild = builds.items.pop();
        await waitForBuildToFinishWithTimeout(testUserClient, lastBuild!.id);
    });

    afterAll(async () => {
        await testUserClient.actor(actorId).delete();
        await afterAllCalls();
    });

    it('without actId', async () => {
        await CallCommand.run([], import.meta.url);
        const actorClient = testUserClient.actor(actorId);
        const runs = await actorClient.runs().list();
        const lastRun = runs.items.pop();
        const lastRunDetail = await testUserClient.run(lastRun!.id).get();
        const output = await testUserClient.keyValueStore(lastRunDetail!.defaultKeyValueStoreId).getRecord('OUTPUT');
        const input = await testUserClient.keyValueStore(lastRunDetail!.defaultKeyValueStoreId).getRecord('INPUT');

        expect(EXPECTED_OUTPUT).toStrictEqual(output!.value);
        expect(EXPECTED_INPUT).toStrictEqual(input!.value);
        expect(EXPECTED_INPUT_CONTENT_TYPE).toStrictEqual(input!.contentType);
    });

    it('should work with just the actor name', async () => {
        try {
            await CallCommand.run([ACTOR_NAME], import.meta.url);
        } catch (err) {
            expect(err).toBeFalsy();
        }

        const actorClient = testUserClient.actor(actorId);
        const runs = await actorClient.runs().list();
        const lastRun = runs.items.pop();
        const lastRunDetail = await testUserClient.run(lastRun!.id).get();
        const output = await testUserClient.keyValueStore(lastRunDetail!.defaultKeyValueStoreId).getRecord('OUTPUT');
        const input = await testUserClient.keyValueStore(lastRunDetail!.defaultKeyValueStoreId).getRecord('INPUT');

        expect(EXPECTED_OUTPUT).toStrictEqual(output!.value);
        expect(EXPECTED_INPUT).toStrictEqual(input!.value);
        expect(EXPECTED_INPUT_CONTENT_TYPE).toStrictEqual(input!.contentType);
    });
});
