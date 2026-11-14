import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import { runCli } from '../../__helpers__/run-cli.js';
import { createTestActor, removeTestActor, type TestActor } from '../../__helpers__/test-actor.js';

describe('[e2e] actor set-value', () => {
	let actor: TestActor;

	beforeAll(async () => {
		actor = await createTestActor();

		// Run the actor once so storage is initialized
		const runResult = await runCli('apify', ['run'], { cwd: actor.dir });
		if (runResult.exitCode !== 0) {
			throw new Error(`Test actor failed to run:\n${runResult.stderr}`);
		}
	});

	afterAll(async () => {
		if (actor) await removeTestActor(actor);
	});

	it('sets a value in the default key-value store', async () => {
		const result = await runCli('apify', ['actor', 'set-value', 'MY_KEY', '{"hello":"world"}'], {
			cwd: actor.dir,
		});
		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);

		const recordPath = path.join(actor.dir, 'storage', 'key_value_stores', 'default', 'MY_KEY.json');
		await expect(readFile(recordPath, 'utf-8')).resolves.toBe('{"hello":"world"}');
	});

	it('deletes a value when no value or stdin is provided', async () => {
		const recordPath = path.join(actor.dir, 'storage', 'key_value_stores', 'default', 'DELETE_ME.json');
		const setResult = await runCli('apify', ['actor', 'set-value', 'DELETE_ME', '{"exists":true}'], {
			cwd: actor.dir,
		});
		expect(setResult.exitCode, `stderr: ${setResult.stderr}`).toBe(0);
		await expect(readFile(recordPath, 'utf-8')).resolves.toBe('{"exists":true}');

		const deleteResult = await runCli('apify', ['actor', 'set-value', 'DELETE_ME'], {
			cwd: actor.dir,
		});
		expect(deleteResult.exitCode, `stderr: ${deleteResult.stderr}`).toBe(0);
		await expect(access(recordPath)).rejects.toThrow();
	});

	it('sets a value from stdin', async () => {
		const result = await runCli('apify', ['actor', 'set-value', 'FROM_STDIN', '--content-type', 'text/plain'], {
			cwd: actor.dir,
			stdin: 'VALUE',
		});
		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);

		const recordPath = path.join(actor.dir, 'storage', 'key_value_stores', 'default', 'FROM_STDIN.txt');
		await expect(readFile(recordPath, 'utf-8')).resolves.toBe('VALUE');
	});
});
