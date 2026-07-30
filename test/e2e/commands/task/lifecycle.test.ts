import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ApifyClient } from 'apify-client';

import { getApifyClientOptions } from '../../../../src/lib/utils.js';
import { runCli } from '../../__helpers__/run-cli.js';
import { createTestActor, removeTestActor, type TestActor } from '../../__helpers__/test-actor.js';

describe('[e2e][api] task namespace', () => {
	let actor: TestActor;
	let authEnv: Record<string, string>;
	let client: ApifyClient;
	let actorFullName: string;
	let taskId: string;
	const taskName = `e2e-task-${randomBytes(6).toString('hex')}`;
	const renamedTitle = 'E2E updated task title';

	beforeAll(async () => {
		const token = process.env.TEST_USER_TOKEN;
		if (!token) throw new Error('TEST_USER_TOKEN env var is required for task tests');

		const authPath = `e2e-task-${randomBytes(6).toString('hex')}`;
		authEnv = { __APIFY_INTERNAL_TEST_AUTH_PATH__: authPath };

		const loginResult = await runCli('apify', ['login', '--token', token], { env: authEnv });
		if (loginResult.exitCode !== 0) {
			throw new Error(`Failed to login:\n${loginResult.stderr}`);
		}

		client = new ApifyClient(await getApifyClientOptions(token));
		const me = await client.user('me').get();

		actor = await createTestActor('e2e-task');
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
		if (taskId && client) {
			try {
				await client.task(taskId).delete();
			} catch {
				// Do nothing
			}
		}

		if (actorFullName && client) {
			try {
				await client.actor(actorFullName).delete();
			} catch {
				// Do nothing
			}
		}

		if (actor) await removeTestActor(actor);
	});

	it('creates a task', async () => {
		const inputPath = join(actor.dir, 'task-input.json');
		writeFileSync(inputPath, JSON.stringify({ hello: 'world' }));

		const result = await runCli(
			'apify',
			['task', 'create', taskName, '--actor', actorFullName, '--input-file', inputPath, '--memory', '1024', '--json'],
			{ env: authEnv },
		);

		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		const task = JSON.parse(result.stdout);
		taskId = task.id;
		expect(task.name).toBe(taskName);
		expect(task.options?.memoryMbytes).toBe(1024);
	});

	it('lists tasks including the new one', async () => {
		const result = await runCli('apify', ['task', 'ls', '--json', '--desc'], { env: authEnv });
		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		const list = JSON.parse(result.stdout);
		expect(list).toHaveProperty('items');
		expect(list.items.some((t: { id: string }) => t.id === taskId)).toBe(true);
	});

	it('shows task info', async () => {
		const jsonResult = await runCli('apify', ['task', 'info', taskName, '--json'], { env: authEnv });
		expect(jsonResult.exitCode, `stderr: ${jsonResult.stderr}`).toBe(0);
		const info = JSON.parse(jsonResult.stdout);
		expect(info.id).toBe(taskId);
		expect(info.input).toMatchObject({ hello: 'world' });

		const textResult = await runCli('apify', ['task', 'info', taskId], { env: authEnv });
		expect(textResult.exitCode, `stderr: ${textResult.stderr}`).toBe(0);
		expect(textResult.stdout).toContain(taskId);
	});

	it('updates a task', async () => {
		const result = await runCli(
			'apify',
			['task', 'update', taskName, '--title', renamedTitle, '--input', '{"hello":"updated"}', '--json'],
			{ env: authEnv },
		);
		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		const updated = JSON.parse(result.stdout);
		expect(updated.title).toBe(renamedTitle);
		expect(updated.input).toMatchObject({ hello: 'updated' });
	});

	it('deletes a task', async () => {
		const result = await runCli('apify', ['task', 'rm', taskName, '--yes'], { env: authEnv });
		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		expect(result.stdout + result.stderr).toMatch(/deleted/i);

		const gone = await client.task(taskId).get();
		expect(gone).toBeUndefined();
		taskId = '';
	});
});
