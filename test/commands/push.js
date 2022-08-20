const { expect } = require('chai');
const sinon = require('sinon');
const fs = require('fs');
const command = require('@oclif/command');
const { ACT_SOURCE_TYPES, SOURCE_FILE_FORMATS } = require('@apify/consts');
const loadJson = require('load-json-file');
const writeJson = require('write-json-file');
const { rimrafPromised } = require('../../src/lib/files');
const { getLocalUserInfo, getActorLocalFilePaths, createSourceFiles } = require('../../src/lib/utils');
const { GLOBAL_CONFIGS_FOLDER, UPLOADS_STORE_NAME } = require('../../src/lib/consts');
const { testUserClient, TEST_USER_TOKEN } = require('./config');

const ACTOR_NAME = `cli-test-${Date.now()}`;
const TEST_ACTOR = {
    name: `my-cli-test-${Date.now()}`,
    isPublic: false,
    versions: [
        {
            versionNumber: '0.0',
            sourceType: 'SOURCE_FILES',
            buildTag: 'latest',
            sourceFiles: [],
        },
    ],
};
const ACT_TEMPLATE = 'project_empty';

describe('apify push', () => {
    before(async function () {
        if (fs.existsSync(GLOBAL_CONFIGS_FOLDER)) {
            // Skip tests if user used CLI on local, it can break local environment!
            this.skip();
            return;
        }
        await command.run(['login', '--token', TEST_USER_TOKEN]);
        await command.run(['create', ACTOR_NAME, '--template', ACT_TEMPLATE]);
        process.chdir(ACTOR_NAME);
    });

    beforeEach(() => {
        sinon.spy(console, 'log');
    });

    it('should work without actorId', async () => {
        const apifyJson = loadJson.sync('apify.json');
        apifyJson.env = {
            MY_ENV_VAR: 'envVarValue',
        };
        writeJson.sync('apify.json', apifyJson);

        await command.run(['push']);

        const userInfo = await getLocalUserInfo();
        const { name } = apifyJson;
        const actorId = `${userInfo.username}/${name}`;
        const createdActorClient = testUserClient.actor(actorId);
        const createdActor = await createdActorClient.get();
        const createdActorVersion = await createdActorClient.version(apifyJson.version).get();

        const expectedApifyJson = {
            name: ACTOR_NAME,
            template: ACT_TEMPLATE,
            version: createdActorVersion.versionNumber,
            buildTag: createdActorVersion.buildTag,
            env: apifyJson.env,
        };

        const filePathsToPush = await getActorLocalFilePaths();
        const sourceFiles = await createSourceFiles(filePathsToPush);

        if (createdActor) await createdActorClient.delete();

        expect(expectedApifyJson).to.be.eql(apifyJson);
        expect(createdActorVersion.versionNumber).to.be.eql(apifyJson.version);
        expect(createdActorVersion.buildTag).to.be.eql(apifyJson.buildTag);
        expect(createdActorVersion.envVars).to.be.eql([{
            name: 'MY_ENV_VAR',
            value: 'envVarValue',
        }]);
        expect(createdActorVersion.sourceFiles.sort()).to.be.eql(sourceFiles.sort());
        expect(createdActorVersion.sourceType).to.be.eql(ACT_SOURCE_TYPES.SOURCE_FILES);
    });

    it('should work with actorId', async () => {
        let testActor = await testUserClient.actors().create(TEST_ACTOR);
        const testActorClient = testUserClient.actor(testActor.id);
        const apifyJson = loadJson.sync('apify.json');

        await command.run(['push', testActor.id]);

        testActor = await testActorClient.get();
        const testActorVersion = await testActorClient.version(apifyJson.version).get();

        const expectedApifyJson = {
            name: apifyJson.name,
            template: ACT_TEMPLATE,
            version: apifyJson.version,
            buildTag: apifyJson.buildTag,
            env: apifyJson.env,
        };

        const filePathsToPush = await getActorLocalFilePaths();
        const sourceFiles = await createSourceFiles(filePathsToPush);

        if (testActor) await testActorClient.delete();

        expect(expectedApifyJson).to.be.eql(apifyJson);
        expect(testActorVersion.versionNumber).to.be.eql(apifyJson.version);
        expect(testActorVersion.buildTag).to.be.eql(apifyJson.buildTag);
        expect(testActorVersion.envVars).to.be.eql([{
            name: 'MY_ENV_VAR',
            value: 'envVarValue',
        }]);
        expect(testActorVersion.sourceFiles.sort()).to.be.eql(sourceFiles.sort());
        expect(testActorVersion.sourceType).to.be.eql(ACT_SOURCE_TYPES.SOURCE_FILES);
    });

    it('should not rewrite current actor envVars', async () => {
        const testActorWithEnvVars = { ...TEST_ACTOR };
        testActorWithEnvVars.versions = [{
            versionNumber: '0.0',
            sourceType: 'SOURCE_FILES',
            buildTag: 'latest',
            sourceFiles: [],
            envVars: [{
                name: 'MY_TEST',
                value: 'myValue',
            }],
        }];
        let testActor = await testUserClient.actors().create(testActorWithEnvVars);
        const testActorClient = testUserClient.actor(testActor.id);
        const apifyJson = loadJson.sync('apify.json');

        apifyJson.env = null;
        writeJson.sync('apify.json', apifyJson);

        await command.run(['push', testActor.id]);

        testActor = await testActorClient.get();
        const testActorVersion = await testActorClient.version(apifyJson.version).get();

        const filePathsToPush = await getActorLocalFilePaths();
        const sourceFiles = await createSourceFiles(filePathsToPush);

        if (testActor) await testActorClient.delete();

        expect(testActorVersion.versionNumber).to.be.eql(apifyJson.version);
        expect(testActorVersion.buildTag).to.be.eql(apifyJson.buildTag);
        expect(testActorVersion.envVars).to.be.eql(testActorWithEnvVars.versions[0].envVars);
        expect(testActorVersion.sourceFiles.sort()).to.be.eql(sourceFiles.sort());
        expect(testActorVersion.sourceType).to.be.eql(ACT_SOURCE_TYPES.SOURCE_FILES);
    });

    it('should upload zip for source files larger that 3MB', async () => {
        const testActorWithEnvVars = { ...TEST_ACTOR };
        testActorWithEnvVars.versions = [{
            versionNumber: '0.0',
            sourceType: 'TARBALL',
            buildTag: 'latest',
            tarballUrl: 'http://example.com/my_test.zip',
            envVars: [{
                name: 'MY_TEST',
                value: 'myValue',
            }],
        }];
        let testActor = await testUserClient.actors().create(testActorWithEnvVars);
        const testActorClient = testUserClient.actor(testActor.id);
        const apifyJson = loadJson.sync('apify.json');

        apifyJson.env = null;
        writeJson.sync('apify.json', apifyJson);

        // Create large file to ensure actor will be uploaded as zip
        fs.writeFileSync('3mb-file.txt', Buffer.alloc(1024 * 1024 * 3));

        await command.run(['push', testActor.id]);

        testActor = await testActorClient.get();
        const testActorVersion = await testActorClient.version(apifyJson.version).get();
        const store = await testUserClient.keyValueStores().getOrCreate(UPLOADS_STORE_NAME);

        if (testActor) await testActorClient.delete();

        expect(testActorVersion).to.be.eql({
            versionNumber: apifyJson.version,
            buildTag: apifyJson.buildTag,
            tarballUrl: `https://api.apify.com/v2/key-value-stores/${store.id}`
                + `/records/${testActor.name}-${apifyJson.version}.zip?disableRedirect=true`,
            envVars: testActorWithEnvVars.versions[0].envVars,
            sourceType: ACT_SOURCE_TYPES.TARBALL,
        });

        // Remove the big file so sources in following tests are not zipped
        fs.unlinkSync('3mb-file.txt');
    });

    it('typescript files should be treated as text', async () => {
        const { name, version } = loadJson.sync('apify.json');

        fs.writeFileSync('some-typescript-file.ts', `console.log('ok');`);

        await command.run(['push']);

        const userInfo = await getLocalUserInfo();
        const actorId = `${userInfo.username}/${name}`;
        const createdActorClient = testUserClient.actor(actorId);
        const createdActor = await createdActorClient.get();
        const createdActorVersion = await createdActorClient.version(version).get();

        if (createdActor) await createdActorClient.delete();

        expect(createdActorVersion.sourceFiles.find((file) => file.name === 'some-typescript-file.ts').format)
            .to.be.equal(SOURCE_FILE_FORMATS.TEXT);
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
