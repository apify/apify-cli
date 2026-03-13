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

const GLOB_TEST_DIR = 'apifyignore-glob-test-dir';

describe('Utils - .apifyignore with file-glob patterns', () => {
	const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath(GLOB_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		execSync('git init', { cwd: tmpPath, stdio: 'ignore' });

		ensureFolderExistsSync(tmpPath, 'src');

		writeFileSync(joinPath('main.js'), 'content', { flag: 'w' });
		writeFileSync(joinPath('src/index.js'), 'content', { flag: 'w' });
		writeFileSync(joinPath('debug.log'), 'content', { flag: 'w' });
		writeFileSync(joinPath('src/error.log'), 'content', { flag: 'w' });
		writeFileSync(joinPath('data.tmp'), 'content', { flag: 'w' });

		writeFileSync(joinPath('.apifyignore'), '*.log\n*.tmp\n', { flag: 'w' });
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should exclude files matched by glob patterns', async () => {
		const paths = await getActorLocalFilePaths(tmpPath);

		expect(paths).toContain('main.js');
		expect(paths).toContain('src/index.js');
		expect(paths).not.toContain('debug.log');
		expect(paths).not.toContain('src/error.log');
		expect(paths).not.toContain('data.tmp');
	});
});

const COMMENT_TEST_DIR = 'apifyignore-comment-test-dir';

describe('Utils - .apifyignore with comments and blank lines', () => {
	const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath(COMMENT_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		execSync('git init', { cwd: tmpPath, stdio: 'ignore' });

		ensureFolderExistsSync(tmpPath, 'logs');

		writeFileSync(joinPath('main.js'), 'content', { flag: 'w' });
		writeFileSync(joinPath('logs/app.log'), 'content', { flag: 'w' });

		writeFileSync(joinPath('.apifyignore'), '# Ignore log files\n\nlogs/\n', { flag: 'w' });
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should ignore comment lines and blank lines in .apifyignore', async () => {
		const paths = await getActorLocalFilePaths(tmpPath);

		expect(paths).toContain('main.js');
		expect(paths).not.toContain('logs/app.log');
	});
});

const EMPTY_TEST_DIR = 'apifyignore-empty-test-dir';

describe('Utils - empty .apifyignore', () => {
	const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath(EMPTY_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		execSync('git init', { cwd: tmpPath, stdio: 'ignore' });

		writeFileSync(joinPath('main.js'), 'content', { flag: 'w' });

		writeFileSync(joinPath('.apifyignore'), '', { flag: 'w' });
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should include all files when .apifyignore is empty', async () => {
		const paths = await getActorLocalFilePaths(tmpPath);

		expect(paths).toContain('main.js');
		expect(paths).toContain('.apifyignore');
	});
});

const NEGATE_TEST_DIR = 'apifyignore-negate-test-dir';

describe('Utils - .apifyignore negation overrides gitignore', () => {
	const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath(NEGATE_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		execSync('git init', { cwd: tmpPath, stdio: 'ignore' });

		ensureFolderExistsSync(tmpPath, 'dist');
		ensureFolderExistsSync(tmpPath, 'src');

		writeFileSync(joinPath('main.js'), 'content', { flag: 'w' });
		writeFileSync(joinPath('src/index.js'), 'content', { flag: 'w' });
		writeFileSync(joinPath('dist/bundle.js'), 'content', { flag: 'w' });
		writeFileSync(joinPath('dist/styles.css'), 'content', { flag: 'w' });
		writeFileSync(joinPath('.env'), 'SECRET=123', { flag: 'w' });

		// git ignores dist/ and .env
		writeFileSync(joinPath('.gitignore'), 'dist/\n.env\n', { flag: 'w' });
		// .apifyignore force-includes dist/ (overrides gitignore)
		writeFileSync(joinPath('.apifyignore'), '!dist/\n', { flag: 'w' });
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should include git-ignored files that match negation patterns in .apifyignore', async () => {
		const paths = await getActorLocalFilePaths(tmpPath);

		expect(paths).toContain('main.js');
		expect(paths).toContain('src/index.js');
		// dist/ is git-ignored but force-included by .apifyignore
		expect(paths).toContain('dist/bundle.js');
		expect(paths).toContain('dist/styles.css');
		// .env is git-ignored and NOT force-included
		expect(paths).not.toContain('.env');
	});
});

const NEGATE_FILE_TEST_DIR = 'apifyignore-negate-file-test-dir';

describe('Utils - .apifyignore negation for specific file', () => {
	const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath(NEGATE_FILE_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		execSync('git init', { cwd: tmpPath, stdio: 'ignore' });

		ensureFolderExistsSync(tmpPath, 'dist');

		writeFileSync(joinPath('main.js'), 'content', { flag: 'w' });
		writeFileSync(joinPath('dist/bundle.js'), 'content', { flag: 'w' });
		writeFileSync(joinPath('dist/debug.log'), 'content', { flag: 'w' });

		// git ignores dist/
		writeFileSync(joinPath('.gitignore'), 'dist/\n', { flag: 'w' });
		// .apifyignore force-includes only dist/bundle.js
		writeFileSync(joinPath('.apifyignore'), '!dist/bundle.js\n', { flag: 'w' });
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should force-include only the specific file, not the whole directory', async () => {
		const paths = await getActorLocalFilePaths(tmpPath);

		expect(paths).toContain('main.js');
		expect(paths).toContain('dist/bundle.js');
		expect(paths).not.toContain('dist/debug.log');
	});
});

const NEGATE_AND_EXCLUDE_TEST_DIR = 'apifyignore-negate-and-exclude-test-dir';

describe('Utils - .apifyignore with both exclude and negation patterns', () => {
	const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath(NEGATE_AND_EXCLUDE_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		execSync('git init', { cwd: tmpPath, stdio: 'ignore' });

		ensureFolderExistsSync(tmpPath, 'dist');
		ensureFolderExistsSync(tmpPath, 'docs');

		writeFileSync(joinPath('main.js'), 'content', { flag: 'w' });
		writeFileSync(joinPath('dist/bundle.js'), 'content', { flag: 'w' });
		writeFileSync(joinPath('docs/README.md'), 'content', { flag: 'w' });

		// git ignores dist/
		writeFileSync(joinPath('.gitignore'), 'dist/\n', { flag: 'w' });
		// .apifyignore: exclude docs/, force-include dist/
		writeFileSync(joinPath('.apifyignore'), 'docs/\n!dist/\n', { flag: 'w' });
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should exclude docs/ and include git-ignored dist/', async () => {
		const paths = await getActorLocalFilePaths(tmpPath);

		expect(paths).toContain('main.js');
		expect(paths).toContain('dist/bundle.js');
		expect(paths).not.toContain('docs/README.md');
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
