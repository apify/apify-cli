import { randomBytes } from 'node:crypto';

import { ApifyClient } from 'apify-client';

import { getApifyClientOptions } from '../../src/lib/utils.js';
import { runCli } from './__helpers__/run-cli.js';
import { createTestActor, removeTestActor, type TestActor } from './__helpers__/test-actor.js';

describe('[e2e] builds namespace', () => {
	let actor: TestActor;
	let authEnv: Record<string, string>;
	let client: ApifyClient;

	beforeAll(async () => {
		const token = process.env.TEST_USER_TOKEN;
		if (!token) throw new Error('TEST_USER_TOKEN env var is required for builds tests');

		// Unique auth path so parallel runs don't collide
		const authPath = `e2e-builds-${randomBytes(6).toString('hex')}`;
		authEnv = { __APIFY_INTERNAL_TEST_AUTH_PATH__: authPath };

		const loginResult = await runCli('apify', ['login', '--token', token], { env: authEnv });
		if (loginResult.exitCode !== 0) {
			throw new Error(`Failed to login:\n${loginResult.stderr}`);
		}

		client = new ApifyClient(getApifyClientOptions(token));

		// Create and push actor
		actor = await createTestActor('e2e-builds');

		const pushResult = await runCli('apify', ['push'], {
			cwd: actor.dir,
			env: authEnv,
		});

		if (pushResult.exitCode !== 0) {
			throw new Error(`Failed to push actor:\n${pushResult.stderr}`);
		}
	});

	afterAll(async () => {
		if (actor?.name && client) {
			try {
				const me = await client.user('me').get();
				await client.actor(`${me.username}/${actor.name}`).delete();
			} catch {
				// Best-effort cleanup
			}
		}

		if (actor) await removeTestActor(actor);
	});

	describe('builds create', () => {
		it('fails with invalid actor ID', async () => {
			const result = await runCli('apify', ['builds', 'create', 'invalid-id'], {
				cwd: actor.dir,
				env: authEnv,
			});

			expect(result.stdout).toContain('Actor with name or ID "invalid-id" was not found');
		});

		it('fails from an unpublished actor directory', async () => {
			const unpushed = await createTestActor('e2e-unpushed');

			const result = await runCli('apify', ['builds', 'create'], {
				cwd: unpushed.dir,
				env: authEnv,
			});

			expect(result.stdout).toContain(`Actor with name "${unpushed.name}" was not found`);

			await removeTestActor(unpushed);
		});

		it('succeeds from a published actor directory', async () => {
			const result = await runCli('apify', ['builds', 'create'], {
				cwd: actor.dir,
				env: authEnv,
			});

			expect(result.stdout).toContain('Build Started');
			expect(result.stdout).toContain(actor.name);
		});

		it('prints valid JSON with --json flag', async () => {
			const result = await runCli('apify', ['builds', 'create', '--json'], {
				cwd: actor.dir,
				env: authEnv,
			});

			expect(() => JSON.parse(result.stdout)).not.toThrow();
		});
	});

	describe('builds info', () => {
		let buildId: string;

		beforeAll(async () => {
			const create = await runCli('apify', ['builds', 'create'], {
				cwd: actor.dir,
				env: authEnv,
			});

			const id =
				create.stdout.match(/Build Started \(ID: (\w+)\)/)?.[1] ??
				create.stderr.match(/Build Started \(ID: (\w+)\)/)?.[1];

			if (!id) {
				throw new Error(`Failed to capture build ID.\nstdout: ${create.stdout}\nstderr: ${create.stderr}`);
			}

			buildId = id;
		});

		it('fails with invalid build ID', async () => {
			const result = await runCli('apify', ['builds', 'info', 'invalid-id'], {
				cwd: actor.dir,
				env: authEnv,
			});

			expect(result.stdout).toContain('Build with ID "invalid-id" was not found');
		});

		it('shows info for a valid build', async () => {
			const result = await runCli('apify', ['builds', 'info', buildId], {
				cwd: actor.dir,
				env: authEnv,
			});

			expect(result.stdout).toContain(actor.name);
		});

		it('prints valid JSON with --json flag', async () => {
			const result = await runCli('apify', ['builds', 'info', buildId, '--json'], {
				cwd: actor.dir,
				env: authEnv,
			});

			expect(() => JSON.parse(result.stdout)).not.toThrow();
		});
	});

	describe('builds ls', () => {
		it('prints valid JSON with --json flag', async () => {
			const result = await runCli('apify', ['builds', 'ls', '--json'], {
				cwd: actor.dir,
				env: authEnv,
			});

			expect(() => JSON.parse(result.stdout)).not.toThrow();
		});
	});
});
