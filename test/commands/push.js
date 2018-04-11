const { expect } = require('chai');
const sinon = require('sinon');
const fs = require('fs');
const command = require('@oclif/command');
const { rimrafPromised } = require('../../src/lib/files');
const loadJson = require('load-json-file');
const { GLOBAL_CONFIGS_FOLDER } = require('../../src/lib/consts');
const { testUserClient } = require('./config');

const ACT_NAME = `my-act-${Date.now()}`;
const TEST_ACT = {
    name: `my-testing-act-${Date.now()}`,
    isPublic: false,
    versions: [
        {
            versionNumber: '0.0',
            sourceType: 'TARBALL',
            buildTag: 'latest',
            sourceCode: 'http://example.com/my_test.zip',
        },
    ],
};
const ACT_TEMPLATE = 'basic';

describe('apify push', () => {
    before(async function () {
        if (fs.existsSync(GLOBAL_CONFIGS_FOLDER)) {
            // Skip tests if user used CLI on local, it can break local environment!
            this.skip();
            return;
        }
        await command.run(['login', '--token', testUserClient.getOptions().token]);
        await command.run(['create', ACT_NAME, '--template', ACT_TEMPLATE]);
        process.chdir(ACT_NAME);
    });

    beforeEach(() => {
        sinon.spy(console, 'log');
    });

    it('push without actId', async () => {
        await command.run(['push']);

        const apifyJson = loadJson.sync('apify.json');

        const { actId } = apifyJson;
        const createdAct = await testUserClient.acts.getAct({ actId });

        const expectedApifyJson = {
            name: ACT_NAME,
            actId,
            template: ACT_TEMPLATE,
            version: createdAct.versions[0],
        };

        if (createdAct) await testUserClient.acts.deleteAct({ actId });

        expect(expectedApifyJson).to.be.eql(apifyJson);
    });

    it('push with actId', async () => {
        let testAct = await testUserClient.acts.createAct({ act: TEST_ACT });
        const beforeApifyJson = loadJson.sync('apify.json');

        await command.run(['push', testAct.id]);

        const afterApifyJson = loadJson.sync('apify.json');
        testAct = await testUserClient.acts.getAct({ actId: testAct.id });

        const expectedApifyJson = {
            name: beforeApifyJson.name,
            actId: beforeApifyJson.actId,
            template: ACT_TEMPLATE,
            version: testAct.versions.find(version => version.versionNumber === afterApifyJson.version.versionNumber),
        };

        if (testAct) await testUserClient.acts.deleteAct({ actId: testAct.id });

        expect(expectedApifyJson).to.be.eql(afterApifyJson);
    });

    afterEach(() => {
        console.log.restore();
    });

    after(async () => {
        process.chdir('../');
        if (fs.existsSync(ACT_NAME)) await rimrafPromised(ACT_NAME);
        await command.run(['logout']);
    });
});
