import { randomBytes } from 'node:crypto';

import { ApifyClient } from 'apify-client';

import { getApifyClientOptions } from '../../../../src/lib/utils.js';
import { runCli } from '../../__helpers__/run-cli.js';

describe('[e2e][api] datasets namespace', () => {
	let authEnv: Record<string, string>;
	let client: ApifyClient;
	let datasetId: string;
	const datasetName = `e2e-ds-${randomBytes(6).toString('hex')}`;
	const renamedDatasetName = `e2e-ds-renamed-${randomBytes(6).toString('hex')}`;

	beforeAll(async () => {
		const token = process.env.TEST_USER_TOKEN;
		if (!token) throw new Error('TEST_USER_TOKEN env var is required for datasets tests');

		const authPath = `e2e-datasets-${randomBytes(6).toString('hex')}`;
		authEnv = { __APIFY_INTERNAL_TEST_AUTH_PATH__: authPath };

		const loginResult = await runCli('apify', ['login', '--token', token], { env: authEnv });
		if (loginResult.exitCode !== 0) {
			throw new Error(`Failed to login:\n${loginResult.stderr}`);
		}

		client = new ApifyClient(getApifyClientOptions(token));
	});

	afterAll(async () => {
		if (datasetId && client) {
			try {
				await client.dataset(datasetId).delete();
			} catch {
				// Do nothing
			}
		}
	});

	it('creates a named dataset', async () => {
		const result = await runCli('apify', ['datasets', 'create', datasetName, '--json'], { env: authEnv });
		expect(result.exitCode).toBe(0);
		const ds = JSON.parse(result.stdout);
		datasetId = ds.id;
		expect(datasetId).toBeTruthy();
	});

	it('creates a named dataset (non-json output)', async () => {
		// Create another dataset to test non-json output, then delete it
		const tmpName = `e2e-ds-tmp-${randomBytes(6).toString('hex')}`;
		const result = await runCli('apify', ['datasets', 'create', tmpName], { env: authEnv });
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('was created');

		// Clean up the temp dataset via API
		const listResult = await runCli('apify', ['datasets', 'ls', '--json'], { env: authEnv });
		const list = JSON.parse(listResult.stdout);
		const tmpDs = list.items.find((d: { name: string }) => d.name === tmpName);
		if (tmpDs) {
			await client.dataset(tmpDs.id).delete();
		}
	});

	it('pushes items to the dataset via argument', async () => {
		const result = await runCli('apify', ['datasets', 'push-items', datasetId, '{"foo":"bar"}'], { env: authEnv });
		expect(result.exitCode).toBe(0);
		expect(result.stderr).toContain('pushed to');
	});

	it('pushes items to the dataset via stdin', async () => {
		const result = await runCli('apify', ['datasets', 'push-items', datasetId], {
			stdin: '[{"a":1},{"b":2}]',
			env: authEnv,
		});
		expect(result.exitCode).toBe(0);
		expect(result.stderr).toContain('pushed to');
	});

	it('gets items from the dataset (JSON)', async () => {
		const result = await runCli('apify', ['datasets', 'get-items', datasetId], { env: authEnv });
		expect(result.exitCode).toBe(0);
		const items = JSON.parse(result.stdout);
		expect(Array.isArray(items)).toBe(true);
		expect(items.length).toBeGreaterThanOrEqual(3);
		expect(items[0]).toHaveProperty('foo', 'bar');
	});

	it('gets items with --limit', async () => {
		const result = await runCli('apify', ['datasets', 'get-items', datasetId, '--limit', '1'], { env: authEnv });
		expect(result.exitCode).toBe(0);
		const items = JSON.parse(result.stdout);
		expect(items).toHaveLength(1);
	});

	it('gets items in CSV format', async () => {
		const result = await runCli('apify', ['datasets', 'get-items', datasetId, '--format', 'csv'], { env: authEnv });
		expect(result.exitCode).toBe(0);
		// CSV output should have comma-separated values
		expect(result.stdout).toContain(',');
	});

	it('shows dataset info (--json)', async () => {
		const result = await runCli('apify', ['datasets', 'info', datasetId, '--json'], { env: authEnv });
		expect(result.exitCode).toBe(0);
		const info = JSON.parse(result.stdout);
		expect(info.id).toBe(datasetId);
	});

	it('shows dataset info (non-json)', async () => {
		const result = await runCli('apify', ['datasets', 'info', datasetId], { env: authEnv });
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain(datasetId);
	});

	it('lists datasets (--json)', async () => {
		const result = await runCli('apify', ['datasets', 'ls', '--json', '--desc'], { env: authEnv });
		expect(result.exitCode).toBe(0);
		const list = JSON.parse(result.stdout);
		expect(list).toHaveProperty('items');
		const found = list.items.some((d: { id: string }) => d.id === datasetId);
		const returnedIds = list.items.map((d: { id: string }) => d.id);
		expect(found, `Dataset ${datasetId} not found in listed IDs: ${returnedIds.join(', ')}`).toBe(true);
	});

	it('renames the dataset', async () => {
		const result = await runCli('apify', ['datasets', 'rename', datasetId, renamedDatasetName], { env: authEnv });
		expect(result.exitCode).toBe(0);
		// The output uses "was changed from" when the dataset already has a name
		expect(result.stdout).toContain('was changed from');
	});

	it('deletes the dataset', async () => {
		const result = await runCli('apify', ['datasets', 'rm', datasetId, '--yes'], { env: authEnv });
		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		expect(result.stdout).toContain('has been deleted');
		// Clear datasetId so afterAll doesn't try to delete again
		datasetId = '';
	});
});
