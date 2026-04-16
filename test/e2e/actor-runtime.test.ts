import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

import { runCli } from './__helpers__/run-cli.js';
import { createTestActor, removeTestActor, type TestActor } from './__helpers__/test-actor.js';

describe('[e2e] actor runtime commands', () => {
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

	describe('set-value / get-value', () => {
		it('sets a value in the default key-value store', async () => {
			const result = await runCli('apify', ['actor', 'set-value', 'MY_KEY', '{"hello":"world"}'], {
				cwd: actor.dir,
			});
			expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		});

		it('gets the value back from the default key-value store', async () => {
			// First make sure the value is set
			await runCli('apify', ['actor', 'set-value', 'MY_KEY', '{"hello":"world"}'], {
				cwd: actor.dir,
			});

			const result = await runCli('apify', ['actor', 'get-value', 'MY_KEY'], {
				cwd: actor.dir,
			});
			expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
			expect(result.stdout).toContain('hello');
			expect(result.stdout).toContain('world');
		});
	});

	describe('push-data', () => {
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

	describe('calculate-memory', () => {
		it('calculates memory with --default-memory-mbytes flag', async () => {
			const result = await runCli('apify', ['actor', 'calculate-memory', '--default-memory-mbytes', '256'], {
				cwd: actor.dir,
			});
			expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
			expect(result.stdout).toContain('Calculated memory');
			expect(result.stdout).toContain('256');
		});

		it('errors when no memory expression is found', async () => {
			const result = await runCli('apify', ['actor', 'calculate-memory'], {
				cwd: actor.dir,
			});
			expect(result.exitCode).not.toBe(0);
			expect(result.stderr).toContain('No memory-calculation expression found');
		});
	});
});
