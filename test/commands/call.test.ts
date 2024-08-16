import { readFileSync, writeFileSync } from 'node:fs';
import { platform } from 'node:os';
import { fileURLToPath } from 'node:url';

import { cryptoRandomObjectId } from '@apify/utilities';
import { captureOutput } from '@oclif/test';

import { LoginCommand } from '../../src/commands/login.js';
import { getLocalKeyValueStorePath } from '../../src/lib/utils.js';
import { waitForBuildToFinishWithTimeout } from '../__setup__/build-utils.js';
import { TEST_USER_TOKEN, testUserClient } from '../__setup__/config.js';
import { useAuthSetup } from '../__setup__/hooks/useAuthSetup.js';
import { useTempPath } from '../__setup__/hooks/useTempPath.js';

const ACTOR_NAME = `call-my-actor-${cryptoRandomObjectId(6)}-${process.version.split('.')[0]}-${platform()}`;
const EXPECTED_OUTPUT = {
	test: Math.random(),
};
const EXPECTED_INPUT = {
	myTestInput: Math.random(),
};
const EXPECTED_INPUT_CONTENT_TYPE = 'application/json';

const pathToInputJson = fileURLToPath(new URL('../__setup__/test-data/input-file.json', import.meta.url));
const expectedInputFile = JSON.parse(readFileSync(pathToInputJson, 'utf-8'));

useAuthSetup({ perTest: false });

const { beforeAllCalls, afterAllCalls, joinPath, toggleCwdBetweenFullAndParentPath, stdin } = useTempPath(ACTOR_NAME, {
	cwd: true,
	cwdParent: true,
	create: true,
	remove: true,
	withStdinMock: true,
});

const { CreateCommand } = await import('../../src/commands/create.js');
const { PushCommand } = await import('../../src/commands/push.js');
const { ActorCallCommand } = await import('../../src/commands/call.js');

describe('apify call', () => {
	let actorId: string;
	let apifyId: string;

	beforeAll(async () => {
		await beforeAllCalls();

		const { username } = await testUserClient.user('me').get();

		await LoginCommand.run(['--token', TEST_USER_TOKEN], import.meta.url);
		await CreateCommand.run(
			[ACTOR_NAME, '--template', 'project_empty', '--skip-dependency-install'],
			import.meta.url,
		);

		const actCode = `
        import { Actor } from 'apify';

        Actor.main(async () => {
            await Actor.setValue('OUTPUT', ${JSON.stringify(EXPECTED_OUTPUT)});
            console.log('Done.');
        });
        `;
		writeFileSync(joinPath('src/main.js'), actCode, { flag: 'w' });

		const inputFile = joinPath(getLocalKeyValueStorePath(), 'INPUT.json');

		writeFileSync(inputFile, JSON.stringify(EXPECTED_INPUT), { flag: 'w' });

		toggleCwdBetweenFullAndParentPath();

		await PushCommand.run(['--no-prompt', '--force'], import.meta.url);

		actorId = `${username}/${ACTOR_NAME}`;

		// Build must finish before doing `apify call`, otherwise we would get nonexisting build with "LATEST" tag error.
		const builds = await testUserClient.actor(actorId).builds().list();
		const lastBuild = builds.items.pop();
		await waitForBuildToFinishWithTimeout(testUserClient, lastBuild!.id);

		apifyId = await testUserClient
			.actor(actorId)
			.get()
			.then((actor) => actor!.id);

		stdin.end();
	});

	afterAll(async () => {
		await testUserClient.actor(actorId).delete();
		await afterAllCalls();
	});

	it('without actId', async () => {
		await ActorCallCommand.run([], import.meta.url);
		const actorClient = testUserClient.actor(actorId);
		const runs = await actorClient.runs().list();
		const lastRun = runs.items.pop();
		const lastRunDetail = await testUserClient.run(lastRun!.id).get();
		const output = await testUserClient.keyValueStore(lastRunDetail!.defaultKeyValueStoreId).getRecord('OUTPUT');
		const input = await testUserClient.keyValueStore(lastRunDetail!.defaultKeyValueStoreId).getRecord('INPUT');

		expect(EXPECTED_OUTPUT).toStrictEqual(output!.value);
		expect(EXPECTED_INPUT).toStrictEqual(input!.value);
		expect(EXPECTED_INPUT_CONTENT_TYPE).toStrictEqual(input!.contentType);
	});

	it('should work with just the Actor name', async () => {
		await expect(ActorCallCommand.run([ACTOR_NAME], import.meta.url)).resolves.toBeUndefined();

		const actorClient = testUserClient.actor(actorId);
		const runs = await actorClient.runs().list();
		const lastRun = runs.items.pop();
		const lastRunDetail = await testUserClient.run(lastRun!.id).get();
		const output = await testUserClient.keyValueStore(lastRunDetail!.defaultKeyValueStoreId).getRecord('OUTPUT');
		const input = await testUserClient.keyValueStore(lastRunDetail!.defaultKeyValueStoreId).getRecord('INPUT');

		expect(EXPECTED_OUTPUT).toStrictEqual(output!.value);
		expect(EXPECTED_INPUT).toStrictEqual(input!.value);
		expect(EXPECTED_INPUT_CONTENT_TYPE).toStrictEqual(input!.contentType);
	});

	it('should work with just the Actor ID', async () => {
		await expect(ActorCallCommand.run([apifyId], import.meta.url)).resolves.toBeUndefined();

		const actorClient = testUserClient.actor(actorId);
		const runs = await actorClient.runs().list();
		const lastRun = runs.items.pop();
		const lastRunDetail = await testUserClient.run(lastRun!.id).get();
		const output = await testUserClient.keyValueStore(lastRunDetail!.defaultKeyValueStoreId).getRecord('OUTPUT');
		const input = await testUserClient.keyValueStore(lastRunDetail!.defaultKeyValueStoreId).getRecord('INPUT');

		expect(EXPECTED_OUTPUT).toStrictEqual(output!.value);
		expect(EXPECTED_INPUT).toStrictEqual(input!.value);
		expect(EXPECTED_INPUT_CONTENT_TYPE).toStrictEqual(input!.contentType);
	});

	it('should work with passed in input', async () => {
		const expectedInput = {
			hello: 'from cli',
		};

		const string = JSON.stringify(expectedInput);

		await expect(ActorCallCommand.run([ACTOR_NAME, '--input', string], import.meta.url)).resolves.toBeUndefined();

		const actorClient = testUserClient.actor(actorId);
		const runs = await actorClient.runs().list();
		const lastRun = runs.items.pop();
		const lastRunDetail = await testUserClient.run(lastRun!.id).get();
		const input = await testUserClient.keyValueStore(lastRunDetail!.defaultKeyValueStoreId).getRecord('INPUT');

		expect(expectedInput).toStrictEqual(input!.value);
		expect(EXPECTED_INPUT_CONTENT_TYPE).toStrictEqual(input!.contentType);
	});

	it('should work with passed in input file', async () => {
		await expect(
			ActorCallCommand.run([ACTOR_NAME, '--input-file', pathToInputJson], import.meta.url),
		).resolves.toBeUndefined();

		const actorClient = testUserClient.actor(actorId);
		const runs = await actorClient.runs().list();
		const lastRun = runs.items.pop();
		const lastRunDetail = await testUserClient.run(lastRun!.id).get();
		const input = await testUserClient.keyValueStore(lastRunDetail!.defaultKeyValueStoreId).getRecord('INPUT');

		expect(expectedInputFile).toStrictEqual(input!.value);
		expect(EXPECTED_INPUT_CONTENT_TYPE).toStrictEqual(input!.contentType);
	});

	it('should work with stdin input without --input or --input-file', async () => {
		const expectedInput = {
			hello: 'from cli',
		};

		const string = JSON.stringify(expectedInput);

		const { error } = await captureOutput(async () => {
			stdin.reset();
			setTimeout(() => {
				stdin.send(`${string}\n`);

				setTimeout(() => {
					stdin.end();
				}, 50);
			}, 1000);

			return ActorCallCommand.run([ACTOR_NAME], import.meta.url);
		});

		expect(error).toBeUndefined();

		const actorClient = testUserClient.actor(actorId);
		const runs = await actorClient.runs().list();
		const lastRun = runs.items.pop();
		const lastRunDetail = await testUserClient.run(lastRun!.id).get();
		const input = await testUserClient.keyValueStore(lastRunDetail!.defaultKeyValueStoreId).getRecord('INPUT');

		expect(expectedInput).toStrictEqual(input!.value);
		expect(EXPECTED_INPUT_CONTENT_TYPE).toStrictEqual(input!.contentType);
	});
});
