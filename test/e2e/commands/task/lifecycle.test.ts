import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ApifyClient } from 'apify-client';

import { getApifyClientOptions } from '../../../../src/lib/utils.js';
import { runCli } from '../../__helpers__/run-cli.js';

describe('[e2e][api] task namespace', () => {
	let authEnv: Record<string, string>;
	let client: ApifyClient;
	let taskId: string;
	const taskName = `e2e-task-${randomBytes(6).toString('hex')}`;
	const renamedTitle = 'E2E updated task title';
	const actorFullName = 'apify/hello-world';

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
	}, 60_000);

	afterAll(async () => {
		if (taskId && client) {
			try {
				await client.task(taskId).delete();
			} catch {
				// Do nothing
			}
		}
	});

	it('creates a task', async () => {
		const inputDir = mkdtempSync(join(tmpdir(), 'apify-cli-task-'));
		const inputPath = join(inputDir, 'task-input.json');
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
		expect(result.stdout).toContain('was deleted');

		const gone = await client.task(taskId).get();
		expect(gone).toBeUndefined();
		taskId = '';
	});
});
