const { expect } = require('chai');
const path = require('path');
const fs = require('fs');
const command = require('@oclif/command');
const { ACT_JOB_STATUSES } = require('@apify/consts');
const { rimrafPromised } = require('../../src/lib/files');
const { GLOBAL_CONFIGS_FOLDER } = require('../../src/lib/consts');
const { testUserClient, TEST_USER_TOKEN } = require('./config');
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
    before(async function () {
        if (fs.existsSync(GLOBAL_CONFIGS_FOLDER)) {
            // Skip tests if user used CLI on local, it can break local environment!
            console.warn(`Test was skipped as directory ${GLOBAL_CONFIGS_FOLDER} exists!`);
            this.skip();
            return;
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
        fs.writeFileSync('main.js', actCode, { flag: 'w' });

        const inputFile = path.join(getLocalKeyValueStorePath(), 'INPUT.json');

        fs.writeFileSync(inputFile, JSON.stringify(EXPECTED_INPUT), { flag: 'w' });

        await command.run(['push']);

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

    after(async () => {
        if (!actorId) return; // Test was skipped.
        await testUserClient.actor(actorId).delete();
        process.chdir('../');
        if (fs.existsSync(ACTOR_NAME)) await rimrafPromised(ACTOR_NAME);
        await command.run(['logout']);
    });
});
