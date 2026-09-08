import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { useTempPath } from '../../__setup__/hooks/useTempPath.js';

const { beforeAllCalls, afterAllCalls, joinPath } = useTempPath('purge-storages', {
	create: true,
	remove: true,
	cwd: true,
	cwdParent: false,
});

const {
	getLocalDatasetPath,
	getLocalKeyValueStorePath,
	getLocalRequestQueuePath,
	getLocalStorageDir,
	purgeDefaultDataset,
	purgeDefaultKeyValueStore,
	purgeDefaultQueue,
} = await import('../../../src/lib/utils.js');

const seedStorage = () => {
	const keyValueStorePath = joinPath(getLocalKeyValueStorePath());
	const datasetPath = joinPath(getLocalDatasetPath());
	const requestQueuePath = joinPath(getLocalRequestQueuePath());

	mkdirSync(keyValueStorePath, { recursive: true });
	mkdirSync(datasetPath, { recursive: true });
	mkdirSync(requestQueuePath, { recursive: true });

	writeFileSync(join(keyValueStorePath, 'INPUT.json'), '{}');
	writeFileSync(join(keyValueStorePath, 'TEST.json'), '{}');
	writeFileSync(join(datasetPath, '000000001.json'), '{}');
	writeFileSync(join(requestQueuePath, 'request.json'), '{}');
};

describe('purge helpers', () => {
	beforeAll(async () => {
		await beforeAllCalls();
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	beforeEach(() => {
		rmSync(joinPath(getLocalStorageDir()), { recursive: true, force: true });
		seedStorage();
	});

	it('deletes stored records and keeps the input file', async () => {
		await purgeDefaultKeyValueStore('INPUT');

		expect(readdirSync(joinPath(getLocalKeyValueStorePath()))).toStrictEqual(['INPUT.json']);
	});

	it('keeps every input key it is given', async () => {
		writeFileSync(joinPath(getLocalKeyValueStorePath(), 'TEMP_INPUT.json'), '{}');

		await purgeDefaultKeyValueStore('INPUT', 'TEMP_INPUT');

		expect(readdirSync(joinPath(getLocalKeyValueStorePath())).sort()).toStrictEqual(['INPUT.json', 'TEMP_INPUT.json']);
	});

	it('deletes the default dataset', async () => {
		await purgeDefaultDataset();

		expect(existsSync(joinPath(getLocalDatasetPath()))).toBe(false);
	});

	it('deletes the default request queue', async () => {
		await purgeDefaultQueue();

		expect(existsSync(joinPath(getLocalRequestQueuePath()))).toBe(false);
	});

	it('does nothing when the storage folder is missing', async () => {
		rmSync(joinPath(getLocalStorageDir()), { recursive: true, force: true });

		await expect(
			Promise.all([purgeDefaultKeyValueStore('INPUT'), purgeDefaultDataset(), purgeDefaultQueue()]),
		).resolves.toBeDefined();
	});
});
