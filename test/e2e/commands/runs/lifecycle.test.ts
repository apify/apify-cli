import { randomBytes } from 'node:crypto';
import { access, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ApifyClient } from 'apify-client';

import { getApifyClientOptions } from '../../../../src/lib/utils.js';
import { runCli } from '../../__helpers__/run-cli.js';
import { createTestActor, removeTestActor, type TestActor } from '../../__helpers__/test-actor.js';

const TestTmpRoot = fileURLToPath(new URL('../../../../tmp/', import.meta.url));

describe('[e2e][api] runs lifecycle', () => {
	let actor: TestActor;
	let authEnv: Record<string, string>;
	let client: ApifyClient;
	let actorFullName: string;
	let runId: string;

	beforeAll(async () => {
		const token = process.env.TEST_USER_TOKEN;
		if (!token) throw new Error('TEST_USER_TOKEN env var is required for runs tests');

		const authPath = `e2e-runs-${randomBytes(6).toString('hex')}`;
		authEnv = { __APIFY_INTERNAL_TEST_AUTH_PATH__: authPath };

		const loginResult = await runCli('apify', ['login', '--token', token], { env: authEnv });
		if (loginResult.exitCode !== 0) {
			throw new Error(`Failed to login:\n${loginResult.stderr}`);
		}

		client = new ApifyClient(getApifyClientOptions(token));
		const me = await client.user('me').get();

		actor = await createTestActor('e2e-runs');
		actorFullName = `${me.username}/${actor.name}`;

		const pushResult = await runCli('apify', ['push'], {
			cwd: actor.dir,
			env: authEnv,
		});

		if (pushResult.exitCode !== 0) {
			throw new Error(`Push failed:\n${pushResult.stderr}\n${pushResult.stdout}`);
		}
	}, 300_000);

	afterAll(async () => {
		if (actorFullName && client) {
			try {
				await client.actor(actorFullName).delete();
			} catch {
				// Do nothing
			}
		}

		if (actor) await removeTestActor(actor);
	});

	it('actors start — starts a run', async () => {
		const result = await runCli('apify', ['actors', 'start', actorFullName, '--json'], {
			cwd: actor.dir,
			env: authEnv,
		});

		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		const data = JSON.parse(result.stdout);
		expect(data.id).toBeTruthy();
		runId = data.id;
	});

	it('runs ls — lists runs', async () => {
		const result = await runCli('apify', ['runs', 'ls', actorFullName, '--json'], {
			cwd: actor.dir,
			env: authEnv,
		});

		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		const data = JSON.parse(result.stdout);
		expect(data).toHaveProperty('items');
		const found = data.items.some((r: { id: string }) => r.id === runId);
		expect(found).toBe(true);
	});

	it('runs info — shows run details', async () => {
		await client.run(runId).waitForFinish();

		const result = await runCli('apify', ['runs', 'info', runId, '--json'], {
			env: authEnv,
		});

		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		const data = JSON.parse(result.stdout);
		expect(data).toHaveProperty('status');
	});

	it('runs log — prints the run log', async () => {
		const result = await runCli('apify', ['runs', 'log', runId], {
			env: authEnv,
		});

		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		expect(result.stdout).toContain('Log for run with ID');
	});

	it('runs resurrect — resurrects a finished run', async () => {
		const result = await runCli('apify', ['runs', 'resurrect', runId, '--json'], {
			env: authEnv,
		});

		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		const data = JSON.parse(result.stdout);
		expect(data.id).toBe(runId);
	});

	it('runs abort — aborts a running run', async () => {
		const result = await runCli('apify', ['runs', 'abort', runId, '--json'], {
			env: authEnv,
		});

		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		const data = JSON.parse(result.stdout);
		expect(data.id).toBe(runId);
	});

	it('runs rm — deletes a run', async () => {
		// Wait for abort to settle before deleting
		await client.run(runId).waitForFinish();

		const result = await runCli('apify', ['runs', 'rm', runId, '--yes'], {
			env: authEnv,
		});

		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		expect(result.stderr).toContain('was deleted');
	});

	it('actors call — calls an actor and waits for completion', async () => {
		const result = await runCli('apify', ['actors', 'call', actorFullName, '--json', '--input', '{"test":true}'], {
			env: authEnv,
		});

		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		const data = JSON.parse(result.stdout);
		expect(data.status).toBe('SUCCEEDED');
	}, 120_000);

	it('pull — downloads actor source', async () => {
		const dirName = `e2e-pull-${randomBytes(6).toString('hex')}`;
		const pullDir = path.join(TestTmpRoot, dirName);

		try {
			const result = await runCli('apify', ['pull', actorFullName, '--dir', dirName], {
				cwd: TestTmpRoot,
				env: authEnv,
			});

			expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
			await expect(access(path.join(pullDir, '.actor', 'actor.json'))).resolves.toBeUndefined();
		} finally {
			await rm(pullDir, { recursive: true, force: true });
		}
	});

	it('actors rm — deletes the actor', async () => {
		const result = await runCli('apify', ['actors', 'rm', actorFullName, '--yes'], {
			env: authEnv,
		});

		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		expect(result.stderr).toContain('was deleted');

		// Clear so afterAll doesn't double-delete
		actorFullName = '';
	});
});
