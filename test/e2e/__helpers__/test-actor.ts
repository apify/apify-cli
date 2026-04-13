import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCli } from './run-cli.js';

const TestTmpRoot = fileURLToPath(new URL('../../tmp/', import.meta.url));
const BasicActorPath = fileURLToPath(new URL('../__fixtures__/basic-actor.js', import.meta.url));
const basicActorSource = await readFile(BasicActorPath, 'utf-8');

const KV_STORE_PATH = path.join('storage', 'key_value_stores', 'default');

export interface TestActor {
	/** Absolute path to the actor project directory */
	dir: string;
	/** Actor name (e.g. "e2e-a1b2c3d4") */
	name: string;
}

/**
 * Create a temporary actor project using `apify create`.
 * Overwrites main.js with the basic test actor that writes STARTED.json + RECEIVED_INPUT.json.
 */
export async function createTestActor(prefix = 'e2e'): Promise<TestActor> {
	const name = `${prefix}-${randomBytes(6).toString('hex')}`;

	await mkdir(TestTmpRoot, { recursive: true });

	const result = await runCli('apify', ['create', name, '--template', 'project_empty'], {
		cwd: TestTmpRoot,
	});

	if (result.exitCode !== 0) {
		throw new Error(`Failed to create test actor "${name}":\n${result.stderr || result.stdout}`);
	}

	const dir = path.join(TestTmpRoot, name);

	await writeFile(path.join(dir, 'src', 'main.js'), basicActorSource);

	return { dir, name };
}

/**
 * Read what the test actor stored during its run.
 */
export async function getRunResults(actorDir: string): Promise<{
	started: boolean;
	input: unknown | null;
}> {
	const storePath = path.join(actorDir, KV_STORE_PATH);

	const [started, input] = await Promise.all([
		readFile(path.join(storePath, 'STARTED.json'), 'utf-8').catch(() => null),
		readFile(path.join(storePath, 'RECEIVED_INPUT.json'), 'utf-8').catch(() => null),
	]);

	return {
		started: started !== null && JSON.parse(started) === 'works',
		input: input ? JSON.parse(input) : null,
	};
}

/**
 * Clean up run artifacts so the actor can be run again cleanly.
 */
export async function cleanRunResults(actorDir: string): Promise<void> {
	const storePath = path.join(actorDir, KV_STORE_PATH);

	await Promise.all([
		rm(path.join(storePath, 'STARTED.json'), { force: true }),
		rm(path.join(storePath, 'RECEIVED_INPUT.json'), { force: true }),
	]);
}

/**
 * Delete the actor project directory.
 */
export async function removeTestActor(actor: TestActor): Promise<void> {
	await rm(actor.dir, { recursive: true, force: true });
}

/**
 * Corrupt the actor.json to test error handling.
 */
export async function corruptActorJson(actorDir: string): Promise<void> {
	await writeFile(path.join(actorDir, '.actor', 'actor.json'), '{ wow "name": "my-invalid-actor" }');
}
