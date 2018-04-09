const { expect } = require('chai');
const fs = require('fs');
const command = require('@oclif/command');
const { rimrafPromised } = require('../../src/lib/files');
const loadJson = require('load-json-file');
const { GLOBAL_CONFIGS_FOLDER } = require('../../src/lib/consts');
const { testUserClient } = require('./config');

const ACT_NAME = `my-act-${Date.now()}`;
const EXPECTED_OUTPUT = {
    test: Math.random(),
};

describe('apify call', () => {
    before(async function () {
        if (fs.existsSync(GLOBAL_CONFIGS_FOLDER)) {
            // Skip tests if user used CLI on local, it can break local environment!
            this.skip();
            return;
        }
        const { token } = testUserClient.getOptions();
        await command.run(['login', '--token', token]);
        await command.run(['create', ACT_NAME, '--template', 'basic']);
        process.chdir(ACT_NAME);
        const actCode = `
        const Apify = require('apify');

        Apify.main(async () => {
            await Apify.setValue('OUTPUT', ${JSON.stringify(EXPECTED_OUTPUT)});
            console.log('Done.');
        });
        `;
        fs.writeFileSync('main.js', actCode, { flag: 'w' });
        await command.run(['push']);
    });

    it('call without actId', async () => {
        await command.run(['call']);
        const { actId } = loadJson.sync('apify.json');
        const runs = await testUserClient.acts.listRuns({ actId });
        const lastRun = runs.items.pop();
        const lastRunDetail = await testUserClient.acts.getRun({ actId, runId: lastRun.id });
        const output = await testUserClient.keyValueStores.getRecord({ storeId: lastRunDetail.defaultKeyValueStoreId, key: 'OUTPUT' });

        expect(EXPECTED_OUTPUT).to.be.eql(output.body);
    });

    after(async () => {
        const { actId } = loadJson.sync('apify.json');
        await testUserClient.acts.deleteAct({ actId });
        process.chdir('../');
        if (fs.existsSync(ACT_NAME)) await rimrafPromised(ACT_NAME);
        await command.run(['logout']);
    });
});
