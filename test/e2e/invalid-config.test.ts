import { runCli } from './__helpers__/run-cli.js';
import { corruptActorJson, createTestActor, removeTestActor, type TestActor } from './__helpers__/test-actor.js';

describe('[e2e] invalid actor.json', () => {
	let actor: TestActor;

	beforeAll(async () => {
		actor = await createTestActor();
		await corruptActorJson(actor.dir);
	});

	afterAll(async () => {
		await removeTestActor(actor);
	});

	it('prints the path to invalid actor.json and exits with code 5', async () => {
		const result = await runCli('apify', ['run'], { cwd: actor.dir });

		expect(result.exitCode).toBe(5);
		expect(result.stderr).toContain('Failed to read local config at path:');
		expect(result.stderr).toContain("Expected property name or '}'");
	});
});
