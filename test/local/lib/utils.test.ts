import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

import axios from 'axios';

import { ACTOR_JOB_STATUSES } from '@apify/consts';

import { execWithLog } from '../../../src/lib/exec.js';
import { ensureFolderExistsSync } from '../../../src/lib/files.js';
import { inputFileRegExp } from '../../../src/lib/input-key.js';
import { createActZip, downloadAndUnzip, getActorLocalFilePaths, outputJobLog } from '../../../src/lib/utils.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';
import { withRetries } from '../../__setup__/hooks/withRetries.js';

const TEST_DIR = 'my-test-dir';
const FOLDERS = ['my_test', 'my_test/test_in_test', 'my_next_test', '.dot_test'];
const FOLDERS_TO_IGNORE = ['test_to_ignore', 'my_test/this_ignore'];
const FILES = [
	'main.js',
	'my_module.js',
	'next_module.js',
	'my_test/test.js',
	'my_test/test_in_test/test.js',
	'my_next_test/test.js',
	'.dot_test/test.js',
];
const FILES_IN_IGNORED_DIR = ['test_to_ignore/in_test_ignore.js'];
const FILES_TO_IGNORE = ['ignored_module.js'];

describe('Utils', () => {
	describe('createActZip()', () => {
		const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath(TEST_DIR, {
			create: true,
			remove: true,
			cwd: false,
			cwdParent: false,
		});

		beforeAll(async () => {
			await beforeAllCalls();

			// Initialize a fresh git repo so the local .gitignore is parsed independently
			// from the parent repo (which gitignores test/tmp entirely)
			await execWithLog({ cmd: 'git', args: ['init'], opts: { cwd: tmpPath } });

			FOLDERS.concat(FOLDERS_TO_IGNORE).forEach((folder) => {
				ensureFolderExistsSync(tmpPath, folder);
			});

			FILES.concat(FILES_TO_IGNORE, FILES_IN_IGNORED_DIR).forEach((file) =>
				writeFileSync(joinPath(file), Math.random().toString(36).substring(7), {
					flag: 'w',
				}),
			);

			const toIgnore = FOLDERS_TO_IGNORE.concat(FILES_TO_IGNORE).join('\n');
			writeFileSync(joinPath('.gitignore'), toIgnore, { flag: 'w' });
		});

		afterAll(async () => {
			await afterAllCalls();
		});

		it('should create zip without files in .gitignore', async () => {
			const zipName = joinPath('test.zip');
			const tempFolder = joinPath('unzip_temp');
			ensureFolderExistsSync(tmpPath, 'unzip_temp');
			const pathsToZip = await getActorLocalFilePaths(tmpPath);
			await createActZip(zipName, pathsToZip, tmpPath);

			// Unzip with same command as on Apify worker
			// Add in some retries for when the FS is slow to update
			await withRetries(
				async () => {
					await execWithLog({
						cmd: 'unzip',
						args: ['-oq', zipName, '-d', tempFolder],
					});
				},
				3,
				20,
			);

			FOLDERS.forEach((folder) => expect(existsSync(join(tempFolder, folder))).toBeTruthy());
			FOLDERS_TO_IGNORE.forEach((folder) => expect(existsSync(join(tempFolder, folder))).toBeFalsy());
			FILES.forEach((file) => expect(existsSync(join(tempFolder, file))).toBeTruthy());
			FILES_IN_IGNORED_DIR.concat(FILES_TO_IGNORE).forEach((file) =>
				expect(existsSync(join(tempFolder, file))).toBeFalsy(),
			);
		});
	});

	describe('downloadAndUnzip()', () => {
		it('should throw on non-2xx responses', async () => {
			vitest.spyOn(axios, 'get').mockResolvedValue({ status: 403, data: Buffer.from('blocked') });

			await expect(downloadAndUnzip({ url: 'https://example.com/a.zip', pathTo: '.' })).rejects.toThrow(/HTTP 403/);
		});

		it('should throw an actionable error when the response body is not a zip', async () => {
			vitest.spyOn(axios, 'get').mockResolvedValue({ status: 200, data: Buffer.from('<html>block page</html>') });

			await expect(downloadAndUnzip({ url: 'https://example.com/a.zip', pathTo: '.' })).rejects.toThrow(
				/not a valid zip archive/,
			);
		});
	});

	describe('outputJobLog()', () => {
		const originalNoLogs = process.env.APIFY_NO_LOGS_IN_TESTS;

		const makeClientWithLog = (log: string | null | undefined) =>
			({
				log: () => ({
					get: async () => log,
					stream: async () => undefined,
				}),
			}) as never;

		const terminalJob = {
			id: 'job-id',
			status: ACTOR_JOB_STATUSES.SUCCEEDED,
		} as never;

		beforeEach(() => {
			delete process.env.APIFY_NO_LOGS_IN_TESTS;
		});

		afterEach(() => {
			vitest.restoreAllMocks();

			if (originalNoLogs === undefined) {
				delete process.env.APIFY_NO_LOGS_IN_TESTS;
			} else {
				process.env.APIFY_NO_LOGS_IN_TESTS = originalNoLogs;
			}
		});

		it('writes an existing terminal job log to stderr', async () => {
			const stderrWrite = vitest.spyOn(process.stderr, 'write').mockImplementation(() => true);

			await outputJobLog({ job: terminalJob, apifyClient: makeClientWithLog('hello\n') });

			expect(stderrWrite).toHaveBeenCalledWith('hello\n');
		});

		it.each([undefined, null])('does not throw or write when a terminal job log is %s', async (log) => {
			const stderrWrite = vitest.spyOn(process.stderr, 'write').mockImplementation(() => true);

			await expect(outputJobLog({ job: terminalJob, apifyClient: makeClientWithLog(log) })).resolves.toBeUndefined();

			expect(stderrWrite).not.toHaveBeenCalled();
		});

		it('keeps empty terminal job logs as valid write input', async () => {
			const stderrWrite = vitest.spyOn(process.stderr, 'write').mockImplementation(() => true);

			await outputJobLog({ job: terminalJob, apifyClient: makeClientWithLog('') });

			expect(stderrWrite).toHaveBeenCalledWith('');
		});
	});

	describe('input file regex', () => {
		const validFiles = ['INPUT', 'INPUT.json', 'INPUT.bin'];

		const invalidFiles = ['INPUT_', 'INPUT.__metadata__.json'];

		validFiles.forEach((file) => {
			it(`should match ${file}`, () => {
				expect(!!file.match(inputFileRegExp('INPUT'))).toBeTruthy();
			});
		});

		invalidFiles.forEach((file) => {
			it(`should not match ${file}`, () => {
				expect(!!file.match(inputFileRegExp('INPUT'))).toBeFalsy();
			});
		});
	});
});
