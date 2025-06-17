import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';

import type { ActorCollectionCreateOptions } from 'apify-client';

import { ACTOR_SOURCE_TYPES, SOURCE_FILE_FORMATS } from '@apify/consts';

import { runCommand } from '../../../src/lib/command-framework/apify-command.js';
import { LOCAL_CONFIG_PATH } from '../../../src/lib/consts.js';
import { createSourceFiles, getActorLocalFilePaths, getLocalUserInfo } from '../../../src/lib/utils.js';
import { testUserClient } from '../../__setup__/config.js';
import { safeLogin, useAuthSetup } from '../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';
import { useUniqueId } from '../../__setup__/hooks/useUniqueId.js';
import { resetCwdCaches } from '../../__setup__/reset-cwd-caches.js';

const ACTOR_NAME = useUniqueId('cli-push');
const TEST_ACTOR: ActorCollectionCreateOptions = {
	name: ACTOR_NAME,
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

useAuthSetup({ perTest: false });

const {
	beforeAllCalls,
	afterAllCalls,
	joinPath,
	tmpPath,
	toggleCwdBetweenFullAndParentPath,
	joinCwdPath,
	forceNewCwd,
} = useTempPath(ACTOR_NAME, { create: true, remove: true, cwd: true, cwdParent: true });

const { lastErrorMessage } = useConsoleSpy();

const { CreateCommand } = await import('../../../src/commands/create.js');
const { ActorsPushCommand } = await import('../../../src/commands/actors/push.js');

describe('[api] apify push', () => {
	const actorsForCleanup = new Set<string>();

	beforeAll(async () => {
		await beforeAllCalls();

		await safeLogin();

		await runCommand(CreateCommand, {
			args_actorName: ACTOR_NAME,
			flags_template: ACT_TEMPLATE,
			flags_skipDependencyInstall: true,
		});

		toggleCwdBetweenFullAndParentPath();
	});

	afterAll(async () => {
		await afterAllCalls();

		for (const actorId of actorsForCleanup) {
			const actorClient = testUserClient.actor(actorId);
			await actorClient.delete();
		}
	});

	beforeEach(() => {
		resetCwdCaches();
	});

	it('should work without actorId', async () => {
		const actorJson = JSON.parse(readFileSync(joinPath(LOCAL_CONFIG_PATH), 'utf8'));
		actorJson.environmentVariables = {
			MY_ENV_VAR: 'envVarValue',
		};
		writeFileSync(joinPath(LOCAL_CONFIG_PATH), JSON.stringify(actorJson, null, '\t'), { flag: 'w' });

		await runCommand(ActorsPushCommand, { flags_noPrompt: true, flags_force: true });

		const userInfo = await getLocalUserInfo();
		const { name } = actorJson;
		const actorId = `${userInfo.username}/${name}`;
		actorsForCleanup.add(actorId);
		const createdActorClient = testUserClient.actor(actorId);
		const createdActor = await createdActorClient.get();
		const createdActorVersion = await createdActorClient.version(actorJson.version).get();

		const filePathsToPush = await getActorLocalFilePaths(tmpPath);
		const sourceFiles = await createSourceFiles(filePathsToPush, tmpPath);

		if (createdActor) await createdActorClient.delete();

		expect(createdActorVersion!.versionNumber).to.be.eql(actorJson.version);
		expect(createdActorVersion!.buildTag).to.be.eql('latest');
		expect(createdActorVersion!.envVars).to.be.eql([
			{
				name: 'MY_ENV_VAR',
				value: 'envVarValue',
			},
		]);
		// TODO: vlad, fix this too
		expect((createdActorVersion as any)!.sourceFiles.sort()).to.be.eql(sourceFiles.sort());
		expect(createdActorVersion!.sourceType).to.be.eql(ACTOR_SOURCE_TYPES.SOURCE_FILES);
	}, 120_000);

	it('should work with actorId', async () => {
		let testActor = await testUserClient.actors().create(TEST_ACTOR);
		const testActorClient = testUserClient.actor(testActor.id);
		const actorJson = JSON.parse(readFileSync(joinPath(LOCAL_CONFIG_PATH), 'utf8'));

		await runCommand(ActorsPushCommand, { args_actorId: testActor.id, flags_noPrompt: true, flags_force: true });

		actorsForCleanup.add(testActor.id);

		testActor = (await testActorClient.get())!;
		const testActorVersion = await testActorClient.version(actorJson!.version).get();

		const filePathsToPush = await getActorLocalFilePaths(tmpPath);
		const sourceFiles = await createSourceFiles(filePathsToPush, tmpPath);

		if (testActor) await testActorClient.delete();

		expect(testActorVersion!.versionNumber).to.be.eql(actorJson.version);
		expect(testActorVersion!.buildTag).to.be.eql('latest');
		expect(testActorVersion!.envVars).to.be.eql([
			{
				name: 'MY_ENV_VAR',
				value: 'envVarValue',
			},
		]);
		expect((testActorVersion as any).sourceFiles.sort()).to.be.eql(sourceFiles.sort());
		expect(testActorVersion!.sourceType).to.be.eql(ACTOR_SOURCE_TYPES.SOURCE_FILES);
	}, 120_000);

	it('should not rewrite current Actor envVars', async () => {
		const testActorWithEnvVars = { ...TEST_ACTOR };
		testActorWithEnvVars.versions = [
			{
				versionNumber: '0.0',
				sourceType: 'SOURCE_FILES' as never,
				buildTag: 'latest',
				sourceFiles: [],
				envVars: [
					{
						name: 'MY_TEST',
						value: 'myValue',
					},
				],
			},
		];
		let testActor = await testUserClient.actors().create(testActorWithEnvVars);
		actorsForCleanup.add(testActor.id);
		const testActorClient = testUserClient.actor(testActor.id);

		const actorJson = JSON.parse(readFileSync(joinPath(LOCAL_CONFIG_PATH), 'utf8'));
		delete actorJson.environmentVariables;
		writeFileSync(joinPath(LOCAL_CONFIG_PATH), JSON.stringify(actorJson, null, '\t'), { flag: 'w' });

		await runCommand(ActorsPushCommand, { args_actorId: testActor.id, flags_noPrompt: true });

		testActor = (await testActorClient.get())!;
		const testActorVersion = await testActorClient.version(actorJson.version).get();

		const filePathsToPush = await getActorLocalFilePaths(tmpPath);
		const sourceFiles = await createSourceFiles(filePathsToPush, tmpPath);

		if (testActor) await testActorClient.delete();

		expect(testActorVersion!.versionNumber).to.be.eql(actorJson.version);
		expect(testActorVersion!.envVars).to.be.eql(testActorWithEnvVars.versions[0].envVars);
		expect((testActorVersion as any).sourceFiles.sort()).to.be.eql(sourceFiles.sort());
		expect(testActorVersion!.sourceType).to.be.eql(ACTOR_SOURCE_TYPES.SOURCE_FILES);
	}, 120_000);

	it('should upload zip for source files larger that 3MB', async () => {
		const testActorWithEnvVars = { ...TEST_ACTOR };
		testActorWithEnvVars.versions = [
			{
				versionNumber: '0.0',
				sourceType: 'TARBALL' as any,
				buildTag: 'latest',
				tarballUrl: 'http://example.com/my_test.zip',
				envVars: [
					{
						name: 'MY_TEST',
						value: 'myValue',
					},
				],
			},
		];
		let testActor = await testUserClient.actors().create(testActorWithEnvVars);
		actorsForCleanup.add(testActor.id);
		const testActorClient = testUserClient.actor(testActor.id);
		const actorJson = JSON.parse(readFileSync(joinPath(LOCAL_CONFIG_PATH), 'utf8'));

		delete actorJson.environmentVariables;
		writeFileSync(joinPath(LOCAL_CONFIG_PATH), JSON.stringify(actorJson, null, '\t'), { flag: 'w' });

		// Create large file to ensure Actor will be uploaded as zip
		writeFileSync(joinPath('3mb-file.txt'), Buffer.alloc(1024 * 1024 * 3));

		await runCommand(ActorsPushCommand, { args_actorId: testActor.id, flags_noPrompt: true });

		// Remove the big file so sources in following tests are not zipped
		unlinkSync(joinPath('3mb-file.txt'));

		testActor = (await testActorClient.get())!;
		const testActorVersion = await testActorClient.version(actorJson.version).get();
		const store = await testUserClient.keyValueStores().getOrCreate(`actor-${testActor.id}-source`);
		await testUserClient.keyValueStore(store.id).delete(); // We just needed the store ID, we can clean up now

		if (testActor) await testActorClient.delete();

		expect(testActorVersion).to.be.eql({
			versionNumber: actorJson.version,
			buildTag: 'latest',
			tarballUrl:
				`${testActorClient.baseUrl}/key-value-stores/${store.id}` +
				`/records/version-${actorJson.version}.zip?disableRedirect=true`,
			envVars: testActorWithEnvVars.versions[0].envVars,
			sourceType: ACTOR_SOURCE_TYPES.TARBALL,
		});
	}, 120_000);

	it('typescript files should be treated as text', async () => {
		const actorJson = JSON.parse(readFileSync(joinPath(LOCAL_CONFIG_PATH), 'utf8'));
		const { name, version } = actorJson;

		writeFileSync(joinPath('some-typescript-file.ts'), `console.log('ok');`);

		await runCommand(ActorsPushCommand, { flags_noPrompt: true, flags_force: true });

		if (existsSync(joinPath('some-typescript-file.ts'))) unlinkSync(joinPath('some-typescript-file.ts'));

		const userInfo = await getLocalUserInfo();
		const actorId = `${userInfo.username}/${name}`;
		actorsForCleanup.add(actorId);
		const createdActorClient = testUserClient.actor(actorId);
		const createdActor = await createdActorClient.get();
		const createdActorVersion = await createdActorClient.version(version).get();

		if (createdActor) await createdActorClient.delete();

		expect(
			(createdActorVersion as any).sourceFiles.find((file: any) => file.name === 'some-typescript-file.ts')
				.format,
		).to.be.equal(SOURCE_FILE_FORMATS.TEXT);
	}, 120_000);

	it('should not push Actor when there is newer version on platform', async () => {
		const testActor = await testUserClient.actors().create(TEST_ACTOR);
		actorsForCleanup.add(testActor.id);
		const testActorClient = testUserClient.actor(testActor.id);
		const actorJson = JSON.parse(readFileSync(joinPath(LOCAL_CONFIG_PATH), 'utf8'));

		// @ts-expect-error Wrong typing of update method
		await testActorClient.version(actorJson.version).update({ buildTag: 'beta' });

		await runCommand(ActorsPushCommand, { args_actorId: testActor.id, flags_noPrompt: true });

		expect(lastErrorMessage()).to.includes('is already on the platform');
	}, 120_000);

	it('should not push Actor when there are no files to push', async () => {
		toggleCwdBetweenFullAndParentPath();

		await mkdir(joinCwdPath('empty-dir'), { recursive: true });

		forceNewCwd('empty-dir');

		await runCommand(ActorsPushCommand, { flags_noPrompt: true });

		expect(lastErrorMessage()).to.include('You need to call this command from a folder that has an Actor in it');
	}, 120_000);

	it('should not push when the folder does not seem to have a valid Actor', async () => {
		toggleCwdBetweenFullAndParentPath();

		await mkdir(joinCwdPath('not-an-actor-i-promise'), { recursive: true });

		forceNewCwd('not-an-actor-i-promise');

		await writeFile(joinCwdPath('owo.txt'), 'Lorem ipsum');

		await runCommand(ActorsPushCommand, { flags_noPrompt: true });

		expect(lastErrorMessage()).to.include('A valid Actor could not be found in the current directory.');
	}, 120_000);
});
