import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { rimrafPromised } from '../../../src/lib/files.js';

describe('rimrafPromised()', () => {
	let testRoot: string;

	beforeEach(async () => {
		testRoot = await mkdtemp(join(tmpdir(), 'apify-cli-rimraf-'));
	});

	afterEach(async () => {
		await rm(testRoot, { recursive: true, force: true });
	});

	it('removes a nested directory tree given a single string path', async () => {
		const dir = join(testRoot, 'single');
		await mkdir(join(dir, 'nested'), { recursive: true });
		await writeFile(join(dir, 'nested', 'file.txt'), 'content');

		await rimrafPromised(dir);

		expect(existsSync(dir)).toBe(false);
	});

	it('removes every path when given an array', async () => {
		const dirA = join(testRoot, 'a');
		const dirB = join(testRoot, 'b');
		await mkdir(dirA);
		await mkdir(dirB);
		await writeFile(join(dirA, 'file.txt'), 'a');
		await writeFile(join(dirB, 'file.txt'), 'b');

		await rimrafPromised([dirA, dirB]);

		expect(existsSync(dirA)).toBe(false);
		expect(existsSync(dirB)).toBe(false);
	});

	it('resolves without throwing when the path does not exist', async () => {
		const missing = join(testRoot, 'does-not-exist');

		await expect(rimrafPromised(missing)).resolves.toBeUndefined();
	});

	it('resolves without throwing when an array mixes existing and missing paths', async () => {
		const existing = join(testRoot, 'existing');
		await mkdir(existing);
		const missing = join(testRoot, 'missing');

		await expect(rimrafPromised([existing, missing])).resolves.toBeUndefined();
		expect(existsSync(existing)).toBe(false);
	});
});

// Check the retry options delegated to fs.rm; these mocks do not exercise native retry timing.
describe('rimrafPromised() retry configuration', () => {
	const mockRm = (impl: (path: string, options: unknown) => Promise<unknown>) => {
		vi.doMock('node:fs/promises', async (importOriginal) => {
			const original = await importOriginal<typeof import('node:fs/promises')>();
			return { ...original, rm: vi.fn(impl) };
		});
	};

	it('passes maxRetries and retryDelay to fs.rm alongside recursive/force', async () => {
		vi.resetModules();
		mockRm(async () => undefined);

		const { rm: mockedRm } = await import('node:fs/promises');
		const { rimrafPromised: rimrafPromisedFresh } = await import('../../../src/lib/files.js');

		await rimrafPromisedFresh('/tmp/apify-cli-fake-path');

		expect(mockedRm).toHaveBeenCalledWith('/tmp/apify-cli-fake-path', {
			recursive: true,
			force: true,
			maxRetries: 10,
			retryDelay: 100,
		});
	});

	it('passes the same retry options to every path in an array', async () => {
		vi.resetModules();
		mockRm(async () => undefined);

		const { rm: mockedRm } = await import('node:fs/promises');
		const { rimrafPromised: rimrafPromisedFresh } = await import('../../../src/lib/files.js');

		await rimrafPromisedFresh(['/tmp/apify-cli-fake-a', '/tmp/apify-cli-fake-b']);

		expect(mockedRm).toHaveBeenCalledTimes(2);
		expect(mockedRm).toHaveBeenNthCalledWith(1, '/tmp/apify-cli-fake-a', {
			recursive: true,
			force: true,
			maxRetries: 10,
			retryDelay: 100,
		});
		expect(mockedRm).toHaveBeenNthCalledWith(2, '/tmp/apify-cli-fake-b', {
			recursive: true,
			force: true,
			maxRetries: 10,
			retryDelay: 100,
		});
	});

	it('propagates the fs.rm rejection unchanged', async () => {
		vi.resetModules();
		const originalError = Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
		mockRm(async () => {
			throw originalError;
		});

		const { rimrafPromised: rimrafPromisedFresh } = await import('../../../src/lib/files.js');

		await expect(rimrafPromisedFresh('/tmp/apify-cli-fake-path')).rejects.toBe(originalError);
	});
});
