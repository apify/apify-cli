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
	checkIfStorageIsEmpty,
	getLocalDatasetPath,
	getLocalInput,
	getLocalKeyValueStorePath,
	getLocalRequestQueuePath,
	getLocalStorageDir,
	purgeDefaultDataset,
	purgeDefaultKeyValueStore,
	purgeDefaultQueue,
} = await import('../../../src/lib/utils.js');

const writeInputSidecar = (filename?: string) =>
	writeFileSync(
		joinPath(getLocalKeyValueStorePath(), 'INPUT.__metadata__.json'),
		JSON.stringify({ key: 'INPUT', contentType: 'application/json; charset=utf-8', filename }),
	);

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

describe('local storage helpers', () => {
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

	it('reports the storage as non-empty while records remain', async () => {
		await expect(checkIfStorageIsEmpty('INPUT')).resolves.toBe(false);
	});

	it('reports the storage as empty once only the input file is left', async () => {
		await Promise.all([purgeDefaultKeyValueStore('INPUT'), purgeDefaultDataset(), purgeDefaultQueue()]);

		await expect(checkIfStorageIsEmpty('INPUT')).resolves.toBe(true);
	});

	it('does nothing when the storage folder is missing', async () => {
		rmSync(joinPath(getLocalStorageDir()), { recursive: true, force: true });

		await Promise.all([purgeDefaultKeyValueStore('INPUT'), purgeDefaultDataset(), purgeDefaultQueue()]);

		expect(existsSync(joinPath(getLocalStorageDir()))).toBe(false);
		await expect(checkIfStorageIsEmpty('INPUT')).resolves.toBe(true);
	});

	it('keeps the input record sidecar and drops the sidecars of purged records', async () => {
		writeInputSidecar('INPUT.json');
		writeFileSync(joinPath(getLocalKeyValueStorePath(), 'TEST.__metadata__.json'), '{}');

		await purgeDefaultKeyValueStore('INPUT');

		expect(readdirSync(joinPath(getLocalKeyValueStorePath())).sort()).toStrictEqual([
			'INPUT.__metadata__.json',
			'INPUT.json',
		]);
	});

	it('keeps the value file the input sidecar is bound to', async () => {
		rmSync(joinPath(getLocalKeyValueStorePath(), 'INPUT.json'));
		writeInputSidecar('input-data.json');
		writeFileSync(joinPath(getLocalKeyValueStorePath(), 'input-data.json'), '{}');

		await purgeDefaultKeyValueStore('INPUT');

		expect(readdirSync(joinPath(getLocalKeyValueStorePath())).sort()).toStrictEqual([
			'INPUT.__metadata__.json',
			'input-data.json',
		]);
	});

	it('reports the storage as empty once only an extension-less input record is left', async () => {
		rmSync(joinPath(getLocalKeyValueStorePath(), 'INPUT.json'));
		writeFileSync(joinPath(getLocalKeyValueStorePath(), 'INPUT'), '{}');
		writeInputSidecar();

		await Promise.all([purgeDefaultKeyValueStore('INPUT'), purgeDefaultDataset(), purgeDefaultQueue()]);

		await expect(checkIfStorageIsEmpty('INPUT')).resolves.toBe(true);
	});

	it('reads the input through the file its sidecar names', () => {
		rmSync(joinPath(getLocalKeyValueStorePath(), 'INPUT.json'));
		writeFileSync(joinPath(getLocalKeyValueStorePath(), 'input-data.json'), '{"from":"sidecar"}');
		writeInputSidecar('input-data.json');

		expect(getLocalInput(joinPath())).toStrictEqual({
			body: Buffer.from('{"from":"sidecar"}'),
			contentType: 'application/json; charset=utf-8',
			fileName: 'input-data.json',
		});
	});

	it('reads an extension-less input record, which mime type alone cannot type', () => {
		rmSync(joinPath(getLocalKeyValueStorePath(), 'INPUT.json'));
		writeFileSync(joinPath(getLocalKeyValueStorePath(), 'INPUT'), '{"bare":true}');
		writeInputSidecar();

		expect(getLocalInput(joinPath())).toStrictEqual({
			body: Buffer.from('{"bare":true}'),
			contentType: 'application/json; charset=utf-8',
			fileName: 'INPUT',
		});
	});

	it('falls back to the input file when its sidecar points at a file that is gone', () => {
		writeInputSidecar('input-data.json');

		expect(getLocalInput(joinPath())).toStrictEqual({
			body: Buffer.from('{}'),
			contentType: 'application/json',
			fileName: 'INPUT.json',
		});
	});

	it('ignores a sidecar binding its key outside the store', () => {
		writeFileSync(joinPath('secret.json'), '{"secret":true}');
		writeInputSidecar('../../../secret.json');

		expect(getLocalInput(joinPath())).toStrictEqual({
			body: Buffer.from('{}'),
			contentType: 'application/json',
			fileName: 'INPUT.json',
		});
	});
});
