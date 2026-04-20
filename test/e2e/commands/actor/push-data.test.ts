import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

import { runCli } from '../../__helpers__/run-cli.js';
import { createTestActor, removeTestActor, type TestActor } from '../../__helpers__/test-actor.js';

describe('[e2e] actor push-data', () => {
	let actor: TestActor;

	beforeAll(async () => {
		actor = await createTestActor();

		// Run the actor once so storage is initialized
		const runResult = await runCli('apify', ['run'], { cwd: actor.dir });
		if (runResult.exitCode !== 0) {
			throw new Error(`Test actor failed to run:\n${runResult.stderr}`);
		}

		// Ensure the default dataset directory exists for push-data tests
		await mkdir(path.join(actor.dir, 'storage', 'datasets', 'default'), { recursive: true });
	});

	afterAll(async () => {
		if (actor) await removeTestActor(actor);
	});

	it('pushes data to the default dataset', async () => {
		const result = await runCli('apify', ['actor', 'push-data', '{"item":"test"}'], {
			cwd: actor.dir,
		});
		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);

		// Verify a file exists in the dataset directory
		const datasetDir = path.join(actor.dir, 'storage', 'datasets', 'default');
		const files = await readdir(datasetDir);
		expect(files.length).toBeGreaterThan(0);
	});
});
