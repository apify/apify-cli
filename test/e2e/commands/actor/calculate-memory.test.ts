import { runCli } from '../../__helpers__/run-cli.js';
import { createTestActor, removeTestActor, type TestActor } from '../../__helpers__/test-actor.js';

describe('[e2e] actor calculate-memory', () => {
	let actor: TestActor;

	beforeAll(async () => {
		actor = await createTestActor();
	});

	afterAll(async () => {
		if (actor) await removeTestActor(actor);
	});

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
