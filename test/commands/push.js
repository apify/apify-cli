const { expect } = require('chai');
const sinon = require('sinon');
const fs = require('fs');
const command = require('@oclif/command');
const { ACT_SOURCE_TYPES } = require('apify-shared/consts');
const { rimrafPromised } = require('../../src/lib/files');
const { getLocalUserInfo } = require('../../src/lib/utils');
const loadJson = require('load-json-file');
const { GLOBAL_CONFIGS_FOLDER, UPLOADS_STORE_NAME } = require('../../src/lib/consts');
const { testUserClient } = require('./config');

const ACTOR_NAME = `cli-test-${Date.now()}`;
const TEST_ACTOR = {
    name: `my-cli-test-${Date.now()}`,
    isPublic: false,
    versions: [
        {
            versionNumber: '0.0',
            sourceType: 'TARBALL',
            buildTag: 'latest',
            tarballUrl: 'http://example.com/my_test.zip',
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
        await command.run(['create', ACTOR_NAME, '--template', ACT_TEMPLATE]);
        process.chdir(ACTOR_NAME);
    });

    beforeEach(() => {
        sinon.spy(console, 'log');
    });

    it('should work without actorId', async () => {
        await command.run(['push']);

        const apifyJson = loadJson.sync('apify.json');
        const userInfo = await getLocalUserInfo();

        const { name } = apifyJson;
        const actorId = `${userInfo.username}/${name}`;
        const createdActor = await testUserClient.acts.getAct({ actId: actorId });
        const createdActorVersion = await testUserClient.acts.getActVersion({
            actId: actorId,
            versionNumber: apifyJson.version,
        });
        const store = await testUserClient.keyValueStores.getOrCreateStore({ storeName: UPLOADS_STORE_NAME });

        const expectedApifyJson = {
            name: ACTOR_NAME,
            template: ACT_TEMPLATE,
            version: createdActorVersion.versionNumber,
            buildTag: createdActorVersion.buildTag,
            env: apifyJson.env,
        };

        if (createdActor) await testUserClient.acts.deleteAct({ actId: actorId });

        expect(expectedApifyJson).to.be.eql(apifyJson);
        expect(createdActorVersion).to.be.eql({
            versionNumber: apifyJson.version,
            buildTag: apifyJson.buildTag,
            envVars: [],
            tarballUrl: `https://api.apify.com/v2/key-value-stores/${store.id}`
                + `/records/${createdActor.name}-${apifyJson.version}.zip?disableRedirect=true`,
            sourceType: ACT_SOURCE_TYPES.TARBALL,
        });
    });

    it('should work with actorId', async () => {
        let testActor = await testUserClient.acts.createAct({ act: TEST_ACTOR });
        const apifyJson = loadJson.sync('apify.json');

        await command.run(['push', testActor.id]);

        testActor = await testUserClient.acts.getAct({ actId: testActor.id });
        const testActorVersion = await testUserClient.acts.getActVersion({
            actId: testActor.id,
            versionNumber: apifyJson.version,
        });
        const store = await testUserClient.keyValueStores.getOrCreateStore({ storeName: UPLOADS_STORE_NAME });

        const expectedApifyJson = {
            name: apifyJson.name,
            template: ACT_TEMPLATE,
            version: apifyJson.version,
            buildTag: apifyJson.buildTag,
            env: apifyJson.env,
        };

        if (testActor) await testUserClient.acts.deleteAct({ actId: testActor.id });

        expect(expectedApifyJson).to.be.eql(apifyJson);
        expect(testActorVersion).to.be.eql({
            versionNumber: apifyJson.version,
            buildTag: apifyJson.buildTag,
            tarballUrl: `https://api.apify.com/v2/key-value-stores/${store.id}`
                + `/records/${testActor.name}-${apifyJson.version}.zip?disableRedirect=true`,
            envVars: [],
            sourceType: ACT_SOURCE_TYPES.TARBALL,
        });
    });

    afterEach(() => {
        console.log.restore();
    });

    after(async () => {
        process.chdir('../');
        if (fs.existsSync(ACTOR_NAME)) await rimrafPromised(ACTOR_NAME);
        await command.run(['logout']);
    });
});
