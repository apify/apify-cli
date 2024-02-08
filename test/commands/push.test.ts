/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';

import { ACTOR_SOURCE_TYPES, SOURCE_FILE_FORMATS } from '@apify/consts';
import { ActorCollectionCreateOptions } from 'apify-client';
import { loadJsonFileSync } from 'load-json-file';
import { writeJsonFileSync } from 'write-json-file';

import { CreateCommand } from '../../src/commands/create.js';
import { LoginCommand } from '../../src/commands/login.js';
import { LogoutCommand } from '../../src/commands/logout.js';
import { PushCommand } from '../../src/commands/push.js';
import { AUTH_FILE_PATH, LOCAL_CONFIG_PATH, UPLOADS_STORE_NAME } from '../../src/lib/consts.js';
import { rimrafPromised } from '../../src/lib/files.js';
import { createSourceFiles, getActorLocalFilePaths, getLocalUserInfo } from '../../src/lib/utils.js';
import { TEST_USER_TOKEN, testUserClient } from '../__setup__/config.js';

const ACTOR_NAME = `cli-test-${Date.now()}`;
const TEST_ACTOR: ActorCollectionCreateOptions = {
    // Less likely to encounter a name conflict when multiple node versions are running tests
    name: `my-cli-test-${Date.now()}-${process.version.split('.')[0]}`,
    isPublic: false,
    versions: [
        {
            versionNumber: '0.0',
            sourceType: 'SOURCE_FILES' as never,
            buildTag: 'latest',
            sourceFiles: [],
        },
    ],
};
const ACT_TEMPLATE = 'project_empty';

describe('apify push', () => {
    let skipAfterHook = false;
    const actorsForCleanup = new Set<string>();
    beforeAll(async () => {
        if (existsSync(AUTH_FILE_PATH)) {
            // Tests could break local environment if user is already logged in
            skipAfterHook = true;
            throw new Error(`Cannot run tests, file ${AUTH_FILE_PATH} exists! Run "apify logout" to fix this.`);
        }

        await LoginCommand.run(['--token', TEST_USER_TOKEN], import.meta.url);
        await CreateCommand.run([ACTOR_NAME, '--template', ACT_TEMPLATE], import.meta.url);
        process.chdir(ACTOR_NAME);
    });

    it('should work without actorId', async () => {
        const actorJson = loadJsonFileSync<{ environmentVariables: Record<string, string>; name: string; version: string }>(LOCAL_CONFIG_PATH);
        actorJson.environmentVariables = {
            MY_ENV_VAR: 'envVarValue',
        };
        writeJsonFileSync(LOCAL_CONFIG_PATH, actorJson);

        await PushCommand.run(['--no-prompt'], import.meta.url);

        const userInfo = await getLocalUserInfo();
        const { name } = actorJson;
        const actorId = `${userInfo.username}/${name}`;
        actorsForCleanup.add(actorId);
        const createdActorClient = testUserClient.actor(actorId);
        const createdActor = await createdActorClient.get();
        const createdActorVersion = await createdActorClient.version(actorJson.version).get();

        const filePathsToPush = await getActorLocalFilePaths();
        const sourceFiles = await createSourceFiles(filePathsToPush);

        if (createdActor) await createdActorClient.delete();

        expect(createdActorVersion!.versionNumber).to.be.eql(actorJson.version);
        expect(createdActorVersion!.buildTag).to.be.eql('latest');
        expect(createdActorVersion!.envVars).to.be.eql([{
            name: 'MY_ENV_VAR',
            value: 'envVarValue',
        }]);
        // TODO: vlad, fix this too
        expect((createdActorVersion as any)!.sourceFiles.sort()).to.be.eql(sourceFiles.sort());
        expect(createdActorVersion!.sourceType).to.be.eql(ACTOR_SOURCE_TYPES.SOURCE_FILES);
    });

    it('should work with actorId', async () => {
        let testActor = await testUserClient.actors().create(TEST_ACTOR);
        const testActorClient = testUserClient.actor(testActor.id);
        const actorJson = loadJsonFileSync<{ version: string }>(LOCAL_CONFIG_PATH);

        await PushCommand.run(['--no-prompt', testActor.id], import.meta.url);

        actorsForCleanup.add(testActor.id);

        testActor = (await testActorClient.get())!;
        const testActorVersion = await testActorClient.version(actorJson!.version).get();

        const filePathsToPush = await getActorLocalFilePaths();
        const sourceFiles = await createSourceFiles(filePathsToPush);

        if (testActor) await testActorClient.delete();

        expect(testActorVersion!.versionNumber).to.be.eql(actorJson.version);
        expect(testActorVersion!.buildTag).to.be.eql('latest');
        expect(testActorVersion!.envVars).to.be.eql([{
            name: 'MY_ENV_VAR',
            value: 'envVarValue',
        }]);
        expect((testActorVersion as any).sourceFiles.sort()).to.be.eql(sourceFiles.sort());
        expect(testActorVersion!.sourceType).to.be.eql(ACTOR_SOURCE_TYPES.SOURCE_FILES);
    });

    it('should not rewrite current actor envVars', async () => {
        const testActorWithEnvVars = { ...TEST_ACTOR };
        testActorWithEnvVars.versions = [{
            versionNumber: '0.0',
            sourceType: 'SOURCE_FILES' as never,
            buildTag: 'latest',
            sourceFiles: [],
            envVars: [{
                name: 'MY_TEST',
                value: 'myValue',
            }],
        }];
        let testActor = await testUserClient.actors().create(testActorWithEnvVars);
        actorsForCleanup.add(testActor.id);
        const testActorClient = testUserClient.actor(testActor.id);

        const actorJson = loadJsonFileSync<{ environmentVariables?: Record<string, string>; version: string }>(LOCAL_CONFIG_PATH);
        delete actorJson.environmentVariables;
        writeJsonFileSync(LOCAL_CONFIG_PATH, actorJson);

        await PushCommand.run(['--no-prompt', testActor.id], import.meta.url);

        testActor = (await testActorClient.get())!;
        const testActorVersion = await testActorClient.version(actorJson.version).get();

        const filePathsToPush = await getActorLocalFilePaths();
        const sourceFiles = await createSourceFiles(filePathsToPush);

        if (testActor) await testActorClient.delete();

        expect(testActorVersion!.versionNumber).to.be.eql(actorJson.version);
        expect(testActorVersion!.envVars).to.be.eql(testActorWithEnvVars.versions[0].envVars);
        expect((testActorVersion as any).sourceFiles.sort()).to.be.eql(sourceFiles.sort());
        expect(testActorVersion!.sourceType).to.be.eql(ACTOR_SOURCE_TYPES.SOURCE_FILES);
    });

    it('should upload zip for source files larger that 3MB', async () => {
        const testActorWithEnvVars = { ...TEST_ACTOR };
        testActorWithEnvVars.versions = [{
            versionNumber: '0.0',
            sourceType: 'TARBALL' as any,
            buildTag: 'latest',
            tarballUrl: 'http://example.com/my_test.zip',
            envVars: [{
                name: 'MY_TEST',
                value: 'myValue',
            }],
        }];
        let testActor = await testUserClient.actors().create(testActorWithEnvVars);
        actorsForCleanup.add(testActor.id);
        const testActorClient = testUserClient.actor(testActor.id);
        const actorJson = loadJsonFileSync<{ environmentVariables?: Record<string, string>; version: string }>(LOCAL_CONFIG_PATH);

        delete actorJson.environmentVariables;
        writeJsonFileSync(LOCAL_CONFIG_PATH, actorJson);

        // Create large file to ensure actor will be uploaded as zip
        writeFileSync('3mb-file.txt', Buffer.alloc(1024 * 1024 * 3));

        await PushCommand.run(['--no-prompt', testActor.id], import.meta.url);

        // Remove the big file so sources in following tests are not zipped
        unlinkSync('3mb-file.txt');

        testActor = (await testActorClient.get())!;
        const testActorVersion = await testActorClient.version(actorJson.version).get();
        const store = await testUserClient.keyValueStores().getOrCreate(UPLOADS_STORE_NAME);

        if (testActor) await testActorClient.delete();

        expect(testActorVersion).to.be.eql({
            versionNumber: actorJson.version,
            buildTag: 'latest',
            tarballUrl: `${testActorClient.baseUrl}/key-value-stores/${store.id}`
                + `/records/${testActor.name}-${actorJson.version}.zip?disableRedirect=true`,
            envVars: testActorWithEnvVars.versions[0].envVars,
            sourceType: ACTOR_SOURCE_TYPES.TARBALL,
        });
    });

    it('typescript files should be treated as text', async () => {
        const { name, version } = loadJsonFileSync<{ environmentVariables?: Record<string, string>; version: string; name: string }>(LOCAL_CONFIG_PATH);

        writeFileSync('some-typescript-file.ts', `console.log('ok');`);

        await PushCommand.run(['--no-prompt'], import.meta.url);

        if (existsSync('some-typescript-file.ts')) unlinkSync('some-typescript-file.ts');

        const userInfo = await getLocalUserInfo();
        const actorId = `${userInfo.username}/${name}`;
        actorsForCleanup.add(actorId);
        const createdActorClient = testUserClient.actor(actorId);
        const createdActor = await createdActorClient.get();
        const createdActorVersion = await createdActorClient.version(version).get();

        if (createdActor) await createdActorClient.delete();

        expect((createdActorVersion as any).sourceFiles.find((file: any) => file.name === 'some-typescript-file.ts').format)
            .to.be.equal(SOURCE_FILE_FORMATS.TEXT);
    });

    afterAll(async () => {
        if (skipAfterHook) return;
        process.chdir('../');
        if (existsSync(ACTOR_NAME)) await rimrafPromised(ACTOR_NAME);

        for (const actorId of actorsForCleanup) {
            const actorClient = testUserClient.actor(actorId);
            await actorClient.delete();
        }

        await LogoutCommand.run([], import.meta.url);
    });
});
