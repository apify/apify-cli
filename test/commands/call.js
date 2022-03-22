const { expect } = require('chai');
const path = require('path');
const fs = require('fs');
const command = require('@oclif/command');
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

let actorId;
describe('apify call', () => {
    before(async function () {
        if (fs.existsSync(GLOBAL_CONFIGS_FOLDER)) {
            // Skip tests if user used CLI on local, it can break local environment!
            this.skip();
            return;
        }
        const { username } = await testUserClient.user('me').get();
        await command.run(['login', '--token', TEST_USER_TOKEN]);
        await command.run(['create', ACTOR_NAME, '--template', 'example_hello_world']);
        process.chdir(ACTOR_NAME);
        const actCode = `
        const Apify = require('apify');

        Apify.main(async () => {
            await Apify.setValue('OUTPUT', ${JSON.stringify(EXPECTED_OUTPUT)});
            console.log('Done.');
        });
        `;
        fs.writeFileSync('main.js', actCode, { flag: 'w' });

        const inputFile = path.join(getLocalKeyValueStorePath(), 'INPUT.json');

        fs.writeFileSync(inputFile, JSON.stringify(EXPECTED_INPUT), { flag: 'w' });

        await command.run(['push']);

        actorId = `${username}/${ACTOR_NAME}`;

        // For some reason tests were failing with nonexisting build with "LATEST" tag.
        // Adding some sleep here as attempt to fix this.
        await new Promise((resolve) => setTimeout(resolve, 1000));
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
        await testUserClient.actor(actorId).delete();
        process.chdir('../');
        if (fs.existsSync(ACTOR_NAME)) await rimrafPromised(ACTOR_NAME);
        await command.run(['logout']);
    });
});
