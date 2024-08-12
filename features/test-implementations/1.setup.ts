import { randomBytes } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';

import { AfterAll, Given, setDefaultTimeout } from '@cucumber/cucumber';

import { assertWorldIsValid, executeCommand, getActorRunResults, TestTmpRoot, type TestWorld } from './0.world';

setDefaultTimeout(20_000);

const createdActors: URL[] = [];

if (!process.env.DO_NOT_DELETE_CUCUMBER_TEST_ACTORS) {
	AfterAll(async () => {
		console.log('\n  Cleaning up actors...');

		for (const path of createdActors) {
			await rm(path, { recursive: true, force: true });
		}
	});
}

const actorJs = await readFile(new URL('./0.basic-actor.js', import.meta.url), 'utf8');

Given<TestWorld>(/my `?pwd`? is a fully initialized actor project directory/i, { timeout: 120_000 }, async function () {
	this.testActor ??= {};

	if (this.testActor.initialized) {
		throw new RangeError('A test actor cannot be initialized multiple times in one scenario');
	}

	const randomId = randomBytes(12).toString('hex');
	const actorName = `cucumber-${randomId}`;

	console.log(`\n  Creating actor: ${actorName} for test...`);

	const result = await executeCommand({
		rawCommand: `apify create ${actorName} --template project_empty`,
	});

	if (result.isOk()) {
		this.testActor.pwd = new URL(`./${actorName}/`, TestTmpRoot);
		this.testActor.initialized = true;

		createdActors.push(this.testActor.pwd);

		// Overwrite the main.js file in the actor with a specific one that should do specific test things

		const mainJsFile = new URL('./src/main.js', this.testActor.pwd);
		await writeFile(mainJsFile, actorJs);
	} else {
		const error = result.unwrapErr();

		throw new Error(`Failed to create actor: ${error.message}`);
	}
});

Given<TestWorld>(/the `actor.json` is valid/i, async function () {
	assertWorldIsValid(this);

	// Well we have no code right now to validate the actor.json file, so we'll just assume it's valid. 🤷
	// Maybe this is something we want to implement >:3
});

Given<TestWorld>(/the actor implementation doesn't throw itself/i, { timeout: 120_000 }, async function () {
	assertWorldIsValid(this);

	const result = await executeCommand({
		rawCommand: 'apify run',
		cwd: this.testActor.pwd,
		stdin: '{"wow": true}',
	});

	if (!result.isOk()) {
		const error = result.unwrapErr();

		throw new Error(`Failed to run actor: ${error.message}`);
	}

	// This throws, which is plenty for this given step
	getActorRunResults(this);
});
