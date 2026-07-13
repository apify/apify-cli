import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ActorRun } from 'apify-client';
import axios from 'axios';

import { execWithLog } from '../../../src/lib/exec.js';
import { ensureFolderExistsSync } from '../../../src/lib/files.js';
import { inputFileRegExp } from '../../../src/lib/input-key.js';
import {
	createActZip,
	downloadAndUnzip,
	getActorLocalFilePaths,
	getApifyClientOptions,
	outputJobLog,
	resolveApiBaseUrl,
	resolveApiPublicBaseUrl,
	resolveLoginApiBaseUrl,
} from '../../../src/lib/utils.js';
import { useAuthSetup } from '../../__setup__/hooks/useAuthSetup.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';
import { withRetries } from '../../__setup__/hooks/withRetries.js';

// `outputJobLog`'s fallback-client-construction site (when no `apifyClient` is passed) constructs
// a real `ApifyClient` directly. Spy on the constructor (keeping every other export real) so we can
// assert on the options it's called with, without needing a live client / network stream.
const { apifyClientCtorSpy } = vi.hoisted(() => ({ apifyClientCtorSpy: vi.fn() }));

vi.mock('apify-client', async (importOriginal) => {
	const actual = await importOriginal<typeof import('apify-client')>();
	return {
		...actual,
		ApifyClient: class {
			constructor(options: unknown) {
				apifyClientCtorSpy(options);
			}
		},
	};
});

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
	describe('API base URL resolution', () => {
		const originalEnv = {
			APIFY_API_BASE_URL: process.env.APIFY_API_BASE_URL,
			APIFY_CLIENT_BASE_URL: process.env.APIFY_CLIENT_BASE_URL,
			APIFY_API_PUBLIC_BASE_URL: process.env.APIFY_API_PUBLIC_BASE_URL,
		};

		afterEach(() => {
			for (const [key, value] of Object.entries(originalEnv)) {
				if (value === undefined) {
					delete process.env[key];
				} else {
					process.env[key] = value;
				}
			}
		});

		describe('resolveApiBaseUrl', () => {
			it('resolves to undefined (client default) with nothing set', () => {
				delete process.env.APIFY_API_BASE_URL;
				delete process.env.APIFY_CLIENT_BASE_URL;
				expect(resolveApiBaseUrl()).toBeUndefined();
			});

			it('uses APIFY_API_BASE_URL when no explicit value is given', () => {
				process.env.APIFY_API_BASE_URL = 'http://a.test';
				expect(resolveApiBaseUrl()).toBe('http://a.test');
			});

			it('an explicit value wins over APIFY_API_BASE_URL', () => {
				process.env.APIFY_API_BASE_URL = 'http://a.test';
				expect(resolveApiBaseUrl('http://explicit.test')).toBe('http://explicit.test');
			});

			it('APIFY_API_BASE_URL wins over APIFY_CLIENT_BASE_URL', () => {
				process.env.APIFY_API_BASE_URL = 'http://a.test';
				process.env.APIFY_CLIENT_BASE_URL = 'http://b.test';
				expect(resolveApiBaseUrl()).toBe('http://a.test');
			});

			it('falls back to APIFY_CLIENT_BASE_URL when APIFY_API_BASE_URL is unset', () => {
				delete process.env.APIFY_API_BASE_URL;
				process.env.APIFY_CLIENT_BASE_URL = 'http://b.test';
				expect(resolveApiBaseUrl()).toBe('http://b.test');
			});

			it('follows the full precedence chain: explicit > APIFY_API_BASE_URL > APIFY_CLIENT_BASE_URL > default', () => {
				process.env.APIFY_API_BASE_URL = 'http://a.test';
				process.env.APIFY_CLIENT_BASE_URL = 'http://b.test';
				expect(resolveApiBaseUrl('http://explicit.test')).toBe('http://explicit.test');
			});
		});

		describe('resolveApiPublicBaseUrl', () => {
			it('resolves to undefined (client default) with nothing set', () => {
				delete process.env.APIFY_API_PUBLIC_BASE_URL;
				expect(resolveApiPublicBaseUrl()).toBeUndefined();
			});

			it('uses APIFY_API_PUBLIC_BASE_URL when no explicit value is given', () => {
				process.env.APIFY_API_PUBLIC_BASE_URL = 'http://pub.test';
				expect(resolveApiPublicBaseUrl()).toBe('http://pub.test');
			});

			it('an explicit value wins over APIFY_API_PUBLIC_BASE_URL', () => {
				process.env.APIFY_API_PUBLIC_BASE_URL = 'http://pub.test';
				expect(resolveApiPublicBaseUrl('http://explicit.test')).toBe('http://explicit.test');
			});

			it('is independent of APIFY_API_BASE_URL', () => {
				process.env.APIFY_API_BASE_URL = 'http://a.test';
				delete process.env.APIFY_API_PUBLIC_BASE_URL;
				expect(resolveApiBaseUrl()).toBe('http://a.test');
				expect(resolveApiPublicBaseUrl()).toBeUndefined();
			});
		});

		describe('resolveLoginApiBaseUrl', () => {
			it('defaults to :3333 when the Console origin is localhost and no env override is set', () => {
				delete process.env.APIFY_API_BASE_URL;
				delete process.env.APIFY_CLIENT_BASE_URL;
				expect(resolveLoginApiBaseUrl('http://localhost:3000', undefined)).toBe('http://localhost:3333');
			});

			it('does not apply the :3333 default when the Console origin is not localhost', () => {
				delete process.env.APIFY_API_BASE_URL;
				delete process.env.APIFY_CLIENT_BASE_URL;
				expect(resolveLoginApiBaseUrl('https://console.apify.com', undefined)).toBeUndefined();
			});

			it('is overridden by APIFY_API_BASE_URL even when the Console origin is localhost', () => {
				expect(resolveLoginApiBaseUrl('http://localhost:3000', 'http://other.test')).toBeUndefined();
			});

			it('is overridden by the legacy APIFY_CLIENT_BASE_URL even when the Console origin is localhost', () => {
				delete process.env.APIFY_API_BASE_URL;
				process.env.APIFY_CLIENT_BASE_URL = 'http://legacy.test';
				expect(resolveLoginApiBaseUrl('http://localhost:3000', undefined)).toBeUndefined();
			});
		});

		describe('getApifyClientOptions', () => {
			// getApifyClientOptions() resolves a token from stored credentials when none is passed,
			// so isolate it from the real ~/.apify auth file / OS keyring, matching other tests that
			// exercise credential-reading code paths.
			useAuthSetup();

			it('forwards the resolved API base URL and public base URL', async () => {
				process.env.APIFY_API_BASE_URL = 'http://a.test';
				process.env.APIFY_API_PUBLIC_BASE_URL = 'http://pub.test';
				const options = await getApifyClientOptions();
				expect(options.baseUrl).toBe('http://a.test');
				expect(options.publicBaseUrl).toBe('http://pub.test');
			});

			it('an explicit apiBaseUrl argument wins over the env var', async () => {
				process.env.APIFY_API_BASE_URL = 'http://a.test';
				const options = await getApifyClientOptions(undefined, 'http://explicit.test');
				expect(options.baseUrl).toBe('http://explicit.test');
			});
		});

		describe('outputJobLog fallback client construction', () => {
			beforeEach(() => {
				apifyClientCtorSpy.mockClear();
			});

			it('constructs the fallback ApifyClient with the resolved base URL and public base URL when no apifyClient is given', async () => {
				process.env.APIFY_API_BASE_URL = 'http://a.test';
				process.env.APIFY_API_PUBLIC_BASE_URL = 'http://pub.test';

				// A terminal job status with APIFY_NO_LOGS_IN_TESTS set (set globally by vitest.config.ts)
				// makes outputJobLog return right after constructing the fallback client, with no network I/O.
				await outputJobLog({ job: { id: 'test-job-id', status: 'SUCCEEDED' } as unknown as ActorRun });

				expect(apifyClientCtorSpy).toHaveBeenCalledWith({
					baseUrl: 'http://a.test',
					publicBaseUrl: 'http://pub.test',
				});
			});
		});
	});

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
