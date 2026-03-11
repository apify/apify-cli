import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

import { ensureFolderExistsSync } from '../../../src/lib/files.js';
import { getActorLocalFilePaths } from '../../../src/lib/utils.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';

const TEST_DIR = 'apifyignore-test-dir';
const FOLDERS = ['src', 'docs', 'assets'];
const FILES = ['main.js', 'src/index.js'];
const FILES_TO_APIFYIGNORE = ['docs/README.md', 'assets/logo.png'];

describe('Utils - .apifyignore with git', () => {
	const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath(TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		execSync('git init', { cwd: tmpPath, stdio: 'ignore' });

		FOLDERS.forEach((folder) => {
			ensureFolderExistsSync(tmpPath, folder);
		});

		FILES.concat(FILES_TO_APIFYIGNORE).forEach((file) => writeFileSync(joinPath(file), 'content', { flag: 'w' }));

		writeFileSync(joinPath('.apifyignore'), 'docs/\nassets/\n', { flag: 'w' });
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should exclude files matched by .apifyignore', async () => {
		const paths = await getActorLocalFilePaths(tmpPath);

		FILES.forEach((file) => expect(paths).toContain(file));
		FILES_TO_APIFYIGNORE.forEach((file) => expect(paths).not.toContain(file));
	});

	it('should include .apifyignore itself in the file list', async () => {
		const paths = await getActorLocalFilePaths(tmpPath);

		expect(paths).toContain('.apifyignore');
	});
});

const NO_IGNORE_TEST_DIR = 'apifyignore-absent-test-dir';

describe('Utils - no .apifyignore present (git)', () => {
	const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath(NO_IGNORE_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		execSync('git init', { cwd: tmpPath, stdio: 'ignore' });

		ensureFolderExistsSync(tmpPath, 'docs');

		writeFileSync(joinPath('main.js'), 'content', { flag: 'w' });
		writeFileSync(joinPath('docs/README.md'), 'content', { flag: 'w' });
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should include all files when .apifyignore is absent', async () => {
		const paths = await getActorLocalFilePaths(tmpPath);

		expect(paths).toContain('main.js');
		expect(paths).toContain('docs/README.md');
	});
});
