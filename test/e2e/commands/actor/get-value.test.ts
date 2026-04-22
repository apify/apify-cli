import { runCli } from '../../__helpers__/run-cli.js';
import { createTestActor, removeTestActor, type TestActor } from '../../__helpers__/test-actor.js';

describe('[e2e] actor get-value', () => {
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
