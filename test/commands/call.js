const fs = require('fs');
const path = require('path');

const { ACT_JOB_STATUSES } = require('@apify/consts');
const command = require('@oclif/command');

const { testUserClient, TEST_USER_TOKEN } = require('./config');
const { AUTH_FILE_PATH } = require('../../src/lib/consts');
const { rimrafPromised } = require('../../src/lib/files');
const { getLocalKeyValueStorePath } = require('../../src/lib/utils');

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
 *
 * @param {Object} client
 * @param {String} buildId
 * @returns {Object}
 */
const waitForBuildToFinish = async (client, buildId) => {
    while (true) { // eslint-disable-line
        const build = await client.build(buildId).get();
        if (build.status !== ACT_JOB_STATUSES.RUNNING) return build;
        await new Promise((resolve) => setTimeout(resolve, 2500));
    }
};

/**
 * Waits for build to finish with timeout, throws an error on timeout
 *
 * @param {Object} client
 * @param {String} buildId
 * @param {Number} timeoutSecs
 */
const waitForBuildToFinishWithTimeout = async (client, buildId, timeoutSecs = 60) => {
    const buildPromise = waitForBuildToFinish(client, buildId);
    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(false), timeoutSecs * 1000));
    const result = await Promise.race([buildPromise, timeoutPromise]);
    if (!result) throw new Error(`Timedout after ${timeoutSecs} seconds`);
};

let actorId;
describe('apify call', () => {
    let skipAfterHook = false;
    beforeAll(async () => {
        if (fs.existsSync(AUTH_FILE_PATH)) {
            // Tests could break local environment if user is already logged in
            skipAfterHook = true;
            throw new Error(`Cannot run tests, file ${AUTH_FILE_PATH} exists! Run "apify logout" to fix this.`);
        }

        const { username } = await testUserClient.user('me').get();
        await command.run(['login', '--token', TEST_USER_TOKEN]);
        await command.run(['create', ACTOR_NAME, '--template', 'project_empty']);
        process.chdir(ACTOR_NAME);
        const actCode = `
        import { Actor } from 'apify';

        Actor.main(async () => {
            await Actor.setValue('OUTPUT', ${JSON.stringify(EXPECTED_OUTPUT)});
            console.log('Done.');
        });
        `;
        fs.writeFileSync('src/main.js', actCode, { flag: 'w' });

        const inputFile = path.join(getLocalKeyValueStorePath(), 'INPUT.json');

        fs.writeFileSync(inputFile, JSON.stringify(EXPECTED_INPUT), { flag: 'w' });

        await command.run(['push', '--no-prompt']);

        actorId = `${username}/${ACTOR_NAME}`;

        // Build must finish before doing `apify call`, otherwise we would get nonexisting build with "LATEST" tag error.
        const builds = await testUserClient.actor(actorId).builds().list();
        const lastBuild = builds.items.pop();
        await waitForBuildToFinishWithTimeout(testUserClient, lastBuild.id);
    });

    it('without actId', async () => {
        await command.run(['call']);
        const actorClient = testUserClient.actor(actorId);
        const runs = await actorClient.runs().list();
        const lastRun = runs.items.pop();
        const lastRunDetail = await testUserClient.run(lastRun.id).get();
        const output = await testUserClient.keyValueStore(lastRunDetail.defaultKeyValueStoreId).getRecord('OUTPUT');
        const input = await testUserClient.keyValueStore(lastRunDetail.defaultKeyValueStoreId).getRecord('INPUT');

        expect(EXPECTED_OUTPUT).to.be.eql(output.value);
        expect(EXPECTED_INPUT).to.be.eql(input.value);
        expect(EXPECTED_INPUT_CONTENT_TYPE).to.be.eql(input.contentType);
    });

    afterAll(async () => {
        if (skipAfterHook) return;
        await testUserClient.actor(actorId).delete();
        process.chdir('../');
        if (fs.existsSync(ACTOR_NAME)) await rimrafPromised(ACTOR_NAME);
        await command.run(['logout']);
    });
});
