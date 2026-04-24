import { randomBytes } from 'node:crypto';

import { ApifyClient } from 'apify-client';

import { getApifyClientOptions } from '../../../../src/lib/utils.js';
import { runCli } from '../../__helpers__/run-cli.js';

describe('[e2e][api] key-value-stores namespace', () => {
	let authEnv: Record<string, string>;
	let client: ApifyClient;
	let storeId: string;
	const storeName = `e2e-kvs-${randomBytes(6).toString('hex')}`;
	const renamedStoreName = `e2e-kvs-renamed-${randomBytes(6).toString('hex')}`;

	beforeAll(async () => {
		const token = process.env.TEST_USER_TOKEN;
		if (!token) throw new Error('TEST_USER_TOKEN env var is required for key-value-stores tests');

		const authPath = `e2e-kvs-${randomBytes(6).toString('hex')}`;
		authEnv = { __APIFY_INTERNAL_TEST_AUTH_PATH__: authPath };

		const loginResult = await runCli('apify', ['login', '--token', token], { env: authEnv });
		if (loginResult.exitCode !== 0) {
			throw new Error(`Failed to login:\n${loginResult.stderr}`);
		}

		client = new ApifyClient(getApifyClientOptions(token));
	});

	afterAll(async () => {
		if (storeId && client) {
			try {
				await client.keyValueStore(storeId).delete();
			} catch {
				// Do nothing
			}
		}
	});

	it('creates a named key-value store', async () => {
		const result = await runCli('apify', ['kvs', 'create', storeName, '--json'], { env: authEnv });
		expect(result.exitCode).toBe(0);
		const store = JSON.parse(result.stdout);
		storeId = store.id;
		expect(storeId).toBeTruthy();
	});

	it('creates a named key-value store (non-json output)', async () => {
		const tmpName = `e2e-kvs-tmp-${randomBytes(6).toString('hex')}`;
		const result = await runCli('apify', ['kvs', 'create', tmpName], { env: authEnv });
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('was created');

		// Clean up the temp store via API
		const listResult = await runCli('apify', ['kvs', 'ls', '--json'], { env: authEnv });
		const list = JSON.parse(listResult.stdout);
		const tmpStore = list.items.find((s: { name: string }) => s.name === tmpName);
		if (tmpStore) {
			await client.keyValueStore(tmpStore.id).delete();
		}
	});

	it('sets a JSON value', async () => {
		const result = await runCli('apify', ['kvs', 'set-value', storeId, 'test-key', '{"hello":"world"}'], {
			env: authEnv,
		});
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('set in the key-value store');
	});

	it('sets a plain text value', async () => {
		const result = await runCli(
			'apify',
			['kvs', 'set-value', storeId, 'text-key', 'hello plain text', '--content-type', 'text/plain'],
			{ env: authEnv },
		);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('set in the key-value store');
	});

	it('gets the JSON value back', async () => {
		const result = await runCli('apify', ['kvs', 'get-value', storeId, 'test-key'], { env: authEnv });
		expect(result.exitCode).toBe(0);
		// The value should be pretty-printed JSON on stdout
		const parsed = JSON.parse(result.stdout);
		expect(parsed).toEqual({ hello: 'world' });
		// Content-type is printed to stderr
		expect(result.stderr).toContain('application/json');
	});

	it('gets the plain text value back', async () => {
		const result = await runCli('apify', ['kvs', 'get-value', storeId, 'text-key'], { env: authEnv });
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('hello plain text');
		expect(result.stderr).toContain('text/plain');
	});

	it('lists keys (--json)', async () => {
		const result = await runCli('apify', ['kvs', 'keys', storeId, '--json'], { env: authEnv });
		expect(result.exitCode).toBe(0);
		const keys = JSON.parse(result.stdout);
		expect(keys).toHaveProperty('items');
		const keyNames = keys.items.map((k: { key: string }) => k.key);
		expect(keyNames).toContain('test-key');
		expect(keyNames).toContain('text-key');
	});

	it('shows store info (--json)', async () => {
		const result = await runCli('apify', ['kvs', 'info', storeId, '--json'], { env: authEnv });
		expect(result.exitCode).toBe(0);
		const info = JSON.parse(result.stdout);
		expect(info.id).toBe(storeId);
	});

	it('shows store info (non-json)', async () => {
		const result = await runCli('apify', ['kvs', 'info', storeId], { env: authEnv });
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain(storeId);
	});

	it('lists all stores (--json)', async () => {
		const result = await runCli('apify', ['kvs', 'ls', '--json', '--desc'], { env: authEnv });
		expect(result.exitCode).toBe(0);
		const list = JSON.parse(result.stdout);
		expect(list).toHaveProperty('items');
		const found = list.items.some((s: { id: string }) => s.id === storeId);
		const returnedIds = list.items.map((s: { id: string }) => s.id);
		expect(found, `Store ${storeId} not found in listed IDs: ${returnedIds.join(', ')}`).toBe(true);
	});

	it('renames the store', async () => {
		const result = await runCli('apify', ['kvs', 'rename', storeId, renamedStoreName], { env: authEnv });
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('was changed from');
	});

	it('deletes a value', async () => {
		const result = await runCli('apify', ['kvs', 'delete-value', storeId, 'test-key', '--yes'], { env: authEnv });
		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		expect(result.stdout).toContain('deleted from the key-value store');
	});

	it('deletes the store', async () => {
		const result = await runCli('apify', ['kvs', 'rm', storeId, '--yes'], { env: authEnv });
		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		expect(result.stdout).toContain('has been deleted');
		// Clear storeId so afterAll doesn't try to delete again
		storeId = '';
	});
});
