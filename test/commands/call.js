const { expect } = require('chai');
const path = require('path');
const fs = require('fs');
const command = require('@oclif/command');
const { rimrafPromised } = require('../../src/lib/files');
const Promise = require('bluebird');
const { GLOBAL_CONFIGS_FOLDER } = require('../../src/lib/consts');
const { testUserClient } = require('./config');
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
        const { token } = testUserClient.getOptions();
        const { username } = await testUserClient.users.getUser();
        await command.run(['login', '--token', token]);
        await command.run(['create', ACTOR_NAME, '--template', 'basic']);
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
        await Promise.delay(1000);
    });

    it('without actId', async () => {
        await command.run(['call']);
        const runs = await testUserClient.acts.listRuns({ actId: actorId });
        const lastRun = runs.items.pop();
        const lastRunDetail = await testUserClient.acts.getRun({ actId: actorId, runId: lastRun.id });
        const output = await testUserClient.keyValueStores.getRecord({ storeId: lastRunDetail.defaultKeyValueStoreId, key: 'OUTPUT' });
        const input = await testUserClient.keyValueStores.getRecord({ storeId: lastRunDetail.defaultKeyValueStoreId, key: 'INPUT' });

        expect(EXPECTED_OUTPUT).to.be.eql(output.body);
        expect(EXPECTED_INPUT).to.be.eql(input.body);
        expect(EXPECTED_INPUT_CONTENT_TYPE).to.be.eql(input.contentType);
    });

    after(async () => {
        await testUserClient.acts.deleteAct({ actId: actorId });
        process.chdir('../');
        if (fs.existsSync(ACTOR_NAME)) await rimrafPromised(ACTOR_NAME);
        await command.run(['logout']);
    });
});
