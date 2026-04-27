import { randomBytes } from 'node:crypto';

import { ApifyClient } from 'apify-client';

import { getApifyClientOptions } from '../../../../src/lib/utils.js';
import { runCli } from '../../__helpers__/run-cli.js';
import { createTestActor, removeTestActor, type TestActor } from '../../__helpers__/test-actor.js';

describe('[e2e][api] builds namespace', () => {
	let actor: TestActor;
	let authEnv: Record<string, string>;
	let client: ApifyClient;
	// A finished, non-default build reused across info/log/tag/rm tests. Deleted in the last section.
	let buildId: string;

	beforeAll(async () => {
		const token = process.env.TEST_USER_TOKEN;
		if (!token) throw new Error('TEST_USER_TOKEN env var is required for builds tests');

		const authPath = `e2e-builds-${randomBytes(6).toString('hex')}`;
		authEnv = { __APIFY_INTERNAL_TEST_AUTH_PATH__: authPath };

		const loginResult = await runCli('apify', ['login', '--token', token], { env: authEnv });
		if (loginResult.exitCode !== 0) {
			throw new Error(`Failed to login:\n${loginResult.stderr}`);
		}

		client = new ApifyClient(getApifyClientOptions(token));

		actor = await createTestActor('e2e-builds');

		// Push creates the actor's default build
		const pushResult = await runCli('apify', ['push'], {
			cwd: actor.dir,
			env: authEnv,
		});

		if (pushResult.exitCode !== 0) {
			throw new Error(`Failed to push actor:\n${pushResult.stderr}`);
		}

		// Create a build for tests — then create another so the first is not the actor's default (which cannot be deleted)
		const create = await runCli('apify', ['builds', 'create', '--json'], {
			cwd: actor.dir,
			env: authEnv,
		});

		buildId = JSON.parse(create.stdout).id;
		await client.build(buildId).waitForFinish();

		const create2 = await runCli('apify', ['builds', 'create', '--json'], {
			cwd: actor.dir,
			env: authEnv,
		});

		await client.build(JSON.parse(create2.stdout).id).waitForFinish();
	});

	afterAll(async () => {
		if (actor?.name && client) {
			try {
				const me = await client.user('me').get();
				await client.actor(`${me.username}/${actor.name}`).delete();
			} catch {
				// Do nothing
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

	describe('builds log', () => {
		it('prints the build log', async () => {
			const result = await runCli('apify', ['builds', 'log', buildId], {
				cwd: actor.dir,
				env: authEnv,
			});

			expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
			expect(result.stderr).toContain('Log for build with ID');
		});

		it('fails with invalid build ID', async () => {
			const result = await runCli('apify', ['builds', 'log', 'invalid-id'], {
				cwd: actor.dir,
				env: authEnv,
			});

			expect(result.exitCode).not.toBe(0);
		});
	});

	describe('builds add-tag / remove-tag', () => {
		const tag = `e2e-tag-${randomBytes(4).toString('hex')}`;

		it('adds a tag to a build', async () => {
			const result = await runCli('apify', ['builds', 'add-tag', '--build', buildId, '--tag', tag], {
				cwd: actor.dir,
				env: authEnv,
			});

			expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
			expect(result.stdout).toContain(`Tag "${tag}"`);
		});

		it('removes the tag from the build', async () => {
			const result = await runCli('apify', ['builds', 'remove-tag', '--build', buildId, '--tag', tag, '--yes'], {
				cwd: actor.dir,
				env: authEnv,
			});

			expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
			expect(result.stdout).toContain(`Tag "${tag}"`);
		});
	});

	describe('builds rm', () => {
		it('deletes a build', async () => {
			const result = await runCli('apify', ['builds', 'rm', buildId, '--yes'], {
				cwd: actor.dir,
				env: authEnv,
			});

			expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
			expect(result.stdout).toContain('was deleted');
		});

		it('fails with invalid build ID', async () => {
			const result = await runCli('apify', ['builds', 'rm', 'invalid-id', '--yes'], {
				cwd: actor.dir,
				env: authEnv,
			});

			expect(result.exitCode).not.toBe(0);
		});
	});
});
