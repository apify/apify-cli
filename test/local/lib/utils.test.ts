import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { INPUT_FILE_REG_EXP } from '../../../src/lib/consts.js';
import { execWithLog } from '../../../src/lib/exec.js';
import { ensureFolderExistsSync } from '../../../src/lib/files.js';
import { createActZip, getActorLocalFilePaths } from '../../../src/lib/utils.js';
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

	describe('getActorLocalFilePaths()', () => {
		describe('without .gitignore', () => {
			const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath('no-gitignore-dir', {
				create: true,
				remove: true,
				cwd: false,
				cwdParent: false,
			});

			beforeAll(async () => {
				await beforeAllCalls();

				ensureFolderExistsSync(tmpPath, 'src');
				writeFileSync(joinPath('main.js'), 'console.log("hi")', { flag: 'w' });
				writeFileSync(joinPath('src/index.js'), 'export default {}', {
					flag: 'w',
				});
				writeFileSync(joinPath('.env'), 'SECRET=123', { flag: 'w' });
			});

			afterAll(async () => {
				await afterAllCalls();
			});

			it('should return all files when no .gitignore exists', async () => {
				const paths = await getActorLocalFilePaths(tmpPath);

				expect(paths).toContain('main.js');
				expect(paths).toContain('src/index.js');
				expect(paths).toContain('.env');
			});
		});

		describe('with .gitignore patterns', () => {
			const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath('gitignore-patterns-dir', {
				create: true,
				remove: true,
				cwd: false,
				cwdParent: false,
			});

			beforeAll(async () => {
				await beforeAllCalls();

				ensureFolderExistsSync(tmpPath, 'src');
				ensureFolderExistsSync(tmpPath, 'dist');
				ensureFolderExistsSync(tmpPath, '.actor');
				writeFileSync(joinPath('src/index.js'), 'export default {}', {
					flag: 'w',
				});
				writeFileSync(joinPath('dist/bundle.js'), 'compiled', { flag: 'w' });
				writeFileSync(joinPath('.env'), 'SECRET=123', { flag: 'w' });
				writeFileSync(joinPath('.actor/actor.json'), '{}', { flag: 'w' });
				writeFileSync(joinPath('package.json'), '{}', { flag: 'w' });
			});

			afterAll(async () => {
				await afterAllCalls();
			});

			it('should exclude files matching .gitignore wildcard patterns', async () => {
				writeFileSync(joinPath('.gitignore'), 'dist\n*.env\n', { flag: 'w' });
				const paths = await getActorLocalFilePaths(tmpPath);

				expect(paths).not.toContain('dist/bundle.js');
				expect(paths).not.toContain('.env');
				expect(paths).toContain('src/index.js');
				expect(paths).toContain('package.json');
			});

			it('should include dot folders not in .gitignore', async () => {
				writeFileSync(joinPath('.gitignore'), 'dist\n', { flag: 'w' });
				const paths = await getActorLocalFilePaths(tmpPath);

				expect(paths).toContain('.actor/actor.json');
				expect(paths).toContain('.env');
			});

			it('should handle negation patterns in .gitignore', async () => {
				writeFileSync(joinPath('.gitignore'), '*.env\n!.env\n', {
					flag: 'w',
				});
				const paths = await getActorLocalFilePaths(tmpPath);

				expect(paths).toContain('.env');
				expect(paths).toContain('src/index.js');
				expect(paths).toContain('dist/bundle.js');
			});

			it('should handle comments and empty lines in .gitignore', async () => {
				writeFileSync(joinPath('.gitignore'), '# This is a comment\n\ndist\n\n# Another comment\n', {
					flag: 'w',
				});
				const paths = await getActorLocalFilePaths(tmpPath);

				expect(paths).not.toContain('dist/bundle.js');
				expect(paths).toContain('src/index.js');
				expect(paths).toContain('.env');
			});

			it('should handle empty .gitignore', async () => {
				writeFileSync(joinPath('.gitignore'), '', { flag: 'w' });
				const paths = await getActorLocalFilePaths(tmpPath);

				expect(paths).toContain('src/index.js');
				expect(paths).toContain('dist/bundle.js');
				expect(paths).toContain('.env');
				expect(paths).toContain('.actor/actor.json');
			});
		});

		describe('with nested .gitignore files', () => {
			const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath('nested-gitignore-dir', {
				create: true,
				remove: true,
				cwd: false,
				cwdParent: false,
			});

			beforeAll(async () => {
				await beforeAllCalls();

				ensureFolderExistsSync(tmpPath, 'src');
				ensureFolderExistsSync(tmpPath, 'src/generated');
				ensureFolderExistsSync(tmpPath, 'lib');
				writeFileSync(joinPath('main.js'), 'entry', { flag: 'w' });
				writeFileSync(joinPath('src/app.js'), 'app', { flag: 'w' });
				writeFileSync(joinPath('src/generated/types.js'), 'generated', { flag: 'w' });
				writeFileSync(joinPath('src/generated/keep.js'), 'keep', { flag: 'w' });
				writeFileSync(joinPath('lib/helper.js'), 'helper', { flag: 'w' });
				writeFileSync(joinPath('lib/temp.log'), 'log', { flag: 'w' });
			});

			afterAll(async () => {
				await afterAllCalls();
			});

			it('should apply nested .gitignore scoped to its directory', async () => {
				writeFileSync(joinPath('.gitignore'), '', { flag: 'w' });
				writeFileSync(joinPath('src/.gitignore'), 'generated\n', { flag: 'w' });
				const paths = await getActorLocalFilePaths(tmpPath);

				expect(paths).toContain('main.js');
				expect(paths).toContain('src/app.js');
				expect(paths).not.toContain('src/generated/types.js');
				expect(paths).not.toContain('src/generated/keep.js');
				expect(paths).toContain('lib/helper.js');
				expect(paths).toContain('lib/temp.log');
			});

			it('should not apply nested .gitignore patterns to sibling directories', async () => {
				writeFileSync(joinPath('.gitignore'), '', { flag: 'w' });
				writeFileSync(joinPath('lib/.gitignore'), '*.log\n', { flag: 'w' });
				const paths = await getActorLocalFilePaths(tmpPath);

				expect(paths).not.toContain('lib/temp.log');
				expect(paths).toContain('lib/helper.js');
				expect(paths).toContain('src/app.js');
				expect(paths).toContain('main.js');
			});

			it('should combine root and nested .gitignore rules', async () => {
				writeFileSync(joinPath('.gitignore'), '*.log\n', { flag: 'w' });
				writeFileSync(joinPath('src/.gitignore'), 'generated\n', { flag: 'w' });
				const paths = await getActorLocalFilePaths(tmpPath);

				expect(paths).toContain('main.js');
				expect(paths).toContain('src/app.js');
				expect(paths).not.toContain('src/generated/types.js');
				expect(paths).not.toContain('lib/temp.log');
				expect(paths).toContain('lib/helper.js');
			});
		});
	});

	describe('input file regex', () => {
		const validFiles = ['INPUT', 'INPUT.json', 'INPUT.bin'];

		const invalidFiles = ['INPUT_', 'INPUT.__metadata__.json'];

		validFiles.forEach((file) => {
			it(`should match ${file}`, () => {
				expect(!!file.match(INPUT_FILE_REG_EXP)).toBeTruthy();
			});
		});

		invalidFiles.forEach((file) => {
			it(`should not match ${file}`, () => {
				expect(!!file.match(INPUT_FILE_REG_EXP)).toBeFalsy();
			});
		});
	});
});
