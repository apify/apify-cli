import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { runCli } from '../__helpers__/run-cli.js';
import { createTestActor, removeTestActor, type TestActor } from '../__helpers__/test-actor.js';

const ENV_PRINTING_ACTOR = [
	`console.log('META_ORIGIN=' + process.env.APIFY_META_ORIGIN);`,
	`console.log('WEB_SERVER_PORT=' + process.env.ACTOR_WEB_SERVER_PORT);`,
	'',
].join('\n');

describe('[e2e] apify run on an Actor with usesStandbyMode', () => {
	let actor: TestActor;

	// APIFY_NO_LOGS_IN_TESTS makes the CLI swallow the Actor's stdout instead of forwarding it,
	// and these assertions read what the Actor printed.
	const runActor = (args: string[]) =>
		runCli('apify', ['run', ...args], { cwd: actor.dir, env: { APIFY_NO_LOGS_IN_TESTS: '' } });

	const setUsesStandbyMode = async (enabled: boolean) => {
		const actorJsonPath = path.join(actor.dir, '.actor', 'actor.json');
		const actorJson = JSON.parse(await readFile(actorJsonPath, 'utf-8'));

		if (enabled) {
			actorJson.usesStandbyMode = true;
		} else {
			delete actorJson.usesStandbyMode;
		}

		await writeFile(actorJsonPath, JSON.stringify(actorJson, null, '\t'));
	};

	beforeAll(async () => {
		actor = await createTestActor('e2e-server');

		await writeFile(path.join(actor.dir, 'src', 'main.js'), ENV_PRINTING_ACTOR);

		await setUsesStandbyMode(true);
	});

	afterAll(async () => {
		if (actor) await removeTestActor(actor);
	});

	it('starts the server interface without a flag', async () => {
		const result = await runActor([]);

		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		expect(result.stdout).toContain('META_ORIGIN=STANDBY');
		expect(result.stdout).toContain('WEB_SERVER_PORT=4321');
		expect(result.stderr).toContain('Running the server interface');
	});

	it('takes the port from --port', async () => {
		const result = await runActor(['--port', '4399']);

		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		expect(result.stdout).toContain('WEB_SERVER_PORT=4399');
	});

	it('runs the input interface with --no-server', async () => {
		const result = await runActor(['--no-server']);

		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		expect(result.stdout).toContain('META_ORIGIN=undefined');
		expect(result.stdout).toContain('WEB_SERVER_PORT=undefined');
		expect(result.stderr).not.toContain('Running the server interface');
	});

	it('starts the server interface with --server when actor.json leaves usesStandbyMode out', async () => {
		await setUsesStandbyMode(false);

		try {
			const result = await runActor(['--server']);

			expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
			expect(result.stdout).toContain('META_ORIGIN=STANDBY');
			expect(result.stdout).toContain('WEB_SERVER_PORT=4321');
			expect(result.stderr).not.toContain('Running the server interface');
		} finally {
			await setUsesStandbyMode(true);
		}
	});

	it('rejects --port together with --no-server', async () => {
		const result = await runActor(['--no-server', '--port', '4399']);

		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toContain('--port flag applies only when the Actor runs its server interface');
	});
});
