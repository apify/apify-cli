import { execSync, spawnSync } from 'node:child_process';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import process from 'node:process';

import { ensureFolderExistsSync } from '../../../src/lib/files.js';
import { getActorLocalFilePaths, getGitignoreMatcher } from '../../../src/lib/utils.js';
import { useIsolatedGit } from '../../__setup__/hooks/useIsolatedGit.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';

const { stubGitHome } = useIsolatedGit('actorignore-git-home');

const TEST_DIR = 'actorignore-test-dir';
const FOLDERS = ['src', 'docs', 'assets'];
const FILES = ['main.js', 'src/index.js'];
const FILES_TO_ACTORIGNORE = ['docs/README.md', 'assets/logo.png'];

describe('Utils - .actorignore with git', () => {
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

		FILES.concat(FILES_TO_ACTORIGNORE).forEach((file) => writeFileSync(joinPath(file), 'content', { flag: 'w' }));

		writeFileSync(joinPath('.actorignore'), 'docs/\nassets/\n', { flag: 'w' });
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should exclude files matched by .actorignore', async () => {
		const paths = await getActorLocalFilePaths(tmpPath);

		FILES.forEach((file) => expect(paths).toContain(file));
		FILES_TO_ACTORIGNORE.forEach((file) => expect(paths).not.toContain(file));
	});

	it('should include .actorignore itself in the file list', async () => {
		const paths = await getActorLocalFilePaths(tmpPath);

		expect(paths).toContain('.actorignore');
	});
});

const GLOB_TEST_DIR = 'actorignore-glob-test-dir';

describe('Utils - .actorignore with file-glob patterns', () => {
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

		writeFileSync(joinPath('.actorignore'), '*.log\n*.tmp\n', { flag: 'w' });
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

const COMMENT_TEST_DIR = 'actorignore-comment-test-dir';

describe('Utils - .actorignore with comments and blank lines', () => {
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

		writeFileSync(joinPath('.actorignore'), '# Ignore log files\n\nlogs/\n', { flag: 'w' });
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should ignore comment lines and blank lines in .actorignore', async () => {
		const paths = await getActorLocalFilePaths(tmpPath);

		expect(paths).toContain('main.js');
		expect(paths).not.toContain('logs/app.log');
	});
});

const EMPTY_TEST_DIR = 'actorignore-empty-test-dir';

describe('Utils - empty .actorignore', () => {
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

		writeFileSync(joinPath('.actorignore'), '', { flag: 'w' });
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should include all files when .actorignore is empty', async () => {
		const paths = await getActorLocalFilePaths(tmpPath);

		expect(paths).toContain('main.js');
		expect(paths).toContain('.actorignore');
	});
});

const NEGATE_TEST_DIR = 'actorignore-negate-test-dir';

describe('Utils - .actorignore negation overrides gitignore', () => {
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
		// .actorignore force-includes dist/ (overrides gitignore)
		writeFileSync(joinPath('.actorignore'), '!dist/\n', { flag: 'w' });
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should include git-ignored files that match negation patterns in .actorignore', async () => {
		const paths = await getActorLocalFilePaths(tmpPath);

		expect(paths).toContain('main.js');
		expect(paths).toContain('src/index.js');
		// dist/ is git-ignored but force-included by .actorignore
		expect(paths).toContain('dist/bundle.js');
		expect(paths).toContain('dist/styles.css');
		// .env is git-ignored and NOT force-included
		expect(paths).not.toContain('.env');
	});
});

const NEGATE_FILE_TEST_DIR = 'actorignore-negate-file-test-dir';

describe('Utils - .actorignore negation for specific file', () => {
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
		// .actorignore force-includes only dist/bundle.js
		writeFileSync(joinPath('.actorignore'), '!dist/bundle.js\n', { flag: 'w' });
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

const NEGATE_AND_EXCLUDE_TEST_DIR = 'actorignore-negate-and-exclude-test-dir';

describe('Utils - .actorignore with both exclude and negation patterns', () => {
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
		// .actorignore: exclude docs/, force-include dist/
		writeFileSync(joinPath('.actorignore'), 'docs/\n!dist/\n', { flag: 'w' });
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

const GITIGNORED_ACTOR_DIR = 'actorignore-gitignored-actor-dir';

describe('Utils - .actor directory included even when git-ignored', () => {
	const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath(GITIGNORED_ACTOR_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		execSync('git init', { cwd: tmpPath, stdio: 'ignore' });

		ensureFolderExistsSync(tmpPath, '.actor');
		ensureFolderExistsSync(tmpPath, 'src');

		writeFileSync(joinPath('main.js'), 'content', { flag: 'w' });
		writeFileSync(joinPath('src/index.js'), 'content', { flag: 'w' });
		writeFileSync(joinPath('.actor/actor.json'), '{}', { flag: 'w' });
		writeFileSync(joinPath('.actor/Dockerfile'), 'FROM node', { flag: 'w' });

		// git ignores .actor/
		writeFileSync(joinPath('.gitignore'), '.actor/\n', { flag: 'w' });
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should always include .actor/ files regardless of gitignore', async () => {
		const paths = await getActorLocalFilePaths(tmpPath);

		expect(paths).toContain('main.js');
		expect(paths).toContain('src/index.js');
		expect(paths).toContain('.actor/actor.json');
		expect(paths).toContain('.actor/Dockerfile');
	});

	it('should include .actor/ files even when actorignored', async () => {
		writeFileSync(joinPath('.actorignore'), '.actor/Dockerfile\n', { flag: 'w' });

		const paths = await getActorLocalFilePaths(tmpPath);

		expect(paths).toContain('.actor/actor.json');
		expect(paths).toContain('.actor/Dockerfile');
	});
});

const NO_IGNORE_TEST_DIR = 'actorignore-absent-test-dir';

describe('Utils - no .actorignore present (git)', () => {
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

	it('should include all files when .actorignore is absent', async () => {
		const paths = await getActorLocalFilePaths(tmpPath);

		expect(paths).toContain('main.js');
		expect(paths).toContain('docs/README.md');
	});
});

const NON_ASCII_TEST_DIR = 'gitignore-non-ascii-test-dir';

describe('Utils - gitignored files with non-ASCII names (git)', () => {
	const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath(NON_ASCII_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		execSync('git init', { cwd: tmpPath, stdio: 'ignore' });
		// git's default, set here in case a global config turns it off. It prints such names quoted and escaped.
		execSync('git config core.quotePath true', { cwd: tmpPath, stdio: 'ignore' });
		// git's default on macOS, where it prints names in NFC whatever their form on disk. Other systems ignore it.
		execSync('git config core.precomposeUnicode true', { cwd: tmpPath, stdio: 'ignore' });

		ensureFolderExistsSync(tmpPath, 'sub');

		writeFileSync(joinPath('main.js'), 'content', { flag: 'w' });
		writeFileSync(joinPath('příliš.log'), 'content', { flag: 'w' });
		writeFileSync(joinPath('sub/žluťoučký.log'), 'content', { flag: 'w' });
		// Decomposed, as macOS archives and older macOS volumes store names.
		writeFileSync(joinPath('čaj.log'.normalize('NFD')), 'content', { flag: 'w' });

		writeFileSync(joinPath('.gitignore'), '*.log\n', { flag: 'w' });
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should exclude them', async () => {
		const paths = (await getActorLocalFilePaths(tmpPath)).map((path) => path.normalize('NFC'));

		expect(paths).toContain('main.js');
		expect(paths).not.toContain('příliš.log');
		expect(paths).not.toContain('sub/žluťoučký.log');
		expect(paths).not.toContain('čaj.log');
	});
});

const IGNORED_SYMLINK_TEST_DIR = 'gitignore-ignored-symlink-test-dir';

// Creating a symlink on Windows needs extra rights.
describe.skipIf(process.platform === 'win32')('Utils - gitignored symlink to a directory (git)', () => {
	const { joinPath, beforeAllCalls, afterAllCalls } = useTempPath(IGNORED_SYMLINK_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		mkdirSync(joinPath('repo'), { recursive: true });
		mkdirSync(joinPath('outside'), { recursive: true });
		execSync('git init', { cwd: joinPath('repo'), stdio: 'ignore' });

		writeFileSync(joinPath('outside', 'o1.txt'), 'content', { flag: 'w' });
		writeFileSync(joinPath('repo', 'main.js'), 'content', { flag: 'w' });
		symlinkSync(joinPath('outside'), joinPath('repo', 'data'), 'dir');

		// git lists the ignored symlink as `data`, without the trailing slash of a directory.
		writeFileSync(joinPath('repo', '.gitignore'), 'data\n', { flag: 'w' });
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should exclude the files below it', async () => {
		const paths = await getActorLocalFilePaths(joinPath('repo'));

		expect(paths).toContain('main.js');
		expect(paths).not.toContain('data/o1.txt');
	});
});

const PATTERN_NAMES_TEST_DIR = 'gitignore-pattern-names-test-dir';

describe('Utils - gitignored files whose names look like patterns (git)', () => {
	const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath(PATTERN_NAMES_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		execSync('git init', { cwd: tmpPath, stdio: 'ignore' });

		writeFileSync(joinPath('a.js'), 'content', { flag: 'w' });
		writeFileSync(joinPath('#hash.txt'), 'content', { flag: 'w' });
		writeFileSync(joinPath('[ab].js'), 'content', { flag: 'w' });

		// Escaped, so both lines match the literal names only.
		writeFileSync(joinPath('.gitignore'), '\\#hash.txt\n\\[ab\\].js\n', { flag: 'w' });
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should exclude exactly the files git lists', async () => {
		const paths = await getActorLocalFilePaths(tmpPath);

		expect(paths).not.toContain('#hash.txt');
		expect(paths).not.toContain('[ab].js');
		expect(paths).toContain('a.js');
	});
});

const GIT_FORCE_INCLUDE_TEST_DIR = 'actorignore-git-force-include-test-dir';

describe('Utils - .actorignore negation with directories and files git lists (git)', () => {
	const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath(GIT_FORCE_INCLUDE_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		execSync('git init', { cwd: tmpPath, stdio: 'ignore' });

		mkdirSync(joinPath('build', 'nested'), { recursive: true });

		writeFileSync(joinPath('main.js'), 'content', { flag: 'w' });
		writeFileSync(joinPath('build/out.js'), 'content', { flag: 'w' });
		writeFileSync(joinPath('build/nested/chunk.js'), 'content', { flag: 'w' });
		writeFileSync(joinPath('keep.log'), 'content', { flag: 'w' });
		writeFileSync(joinPath('drop.log'), 'content', { flag: 'w' });

		// git lists build/ as a directory and the two logs as files.
		writeFileSync(joinPath('.gitignore'), 'build/\n*.log\n', { flag: 'w' });
		writeFileSync(joinPath('.actorignore'), '!build/\n!keep.log\n', { flag: 'w' });
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should include the force-included files and exclude the rest', async () => {
		const paths = await getActorLocalFilePaths(tmpPath);

		expect(paths).toContain('main.js');
		expect(paths).toContain('build/out.js');
		expect(paths).toContain('build/nested/chunk.js');
		expect(paths).toContain('keep.log');
		expect(paths).not.toContain('drop.log');
	});
});

const IGNORED_DIR_GIT_TEST_DIR = 'gitignore-ignored-dir-git-test-dir';

describe('Utils - pushing a directory .gitignore ignores (git)', () => {
	// The root .gitignore ignores ghost/, so git lists only `./` from inside it. The push is explicit, so every other
	// rule still applies: the root .gitignore, ghost/.gitignore, .git/info/exclude, and the excludes file git config
	// names. ghost/.actorignore force-includes a directory ghost/.gitignore ignores. The `!` lines of a deeper file
	// re-include what a shallower one ignores.
	const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath(IGNORED_DIR_GIT_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		execSync('git init', { cwd: tmpPath, stdio: 'ignore' });
		execSync('git config core.excludesFile global-excludes', { cwd: tmpPath, stdio: 'ignore' });

		mkdirSync(joinPath('ghost', 'src'), { recursive: true });
		mkdirSync(joinPath('ghost', 'dist'), { recursive: true });

		writeFileSync(joinPath('.gitignore'), 'ghost/\n*.log\n', { flag: 'w' });
		writeFileSync(joinPath('.git', 'info', 'exclude'), '*.pem\n', { flag: 'w' });
		writeFileSync(joinPath('global-excludes'), '*.bak\n', { flag: 'w' });
		writeFileSync(joinPath('ghost', '.gitignore'), 'secret.env\ndist/\n!public.pem\n', { flag: 'w' });
		writeFileSync(joinPath('ghost', 'src', '.gitignore'), '!keep.log\n', { flag: 'w' });
		writeFileSync(joinPath('ghost', '.actorignore'), '!dist/\n', { flag: 'w' });

		[
			'main.js',
			'src/index.js',
			'secret.env',
			'x.log',
			'src/y.log',
			'src/keep.log',
			'key.pem',
			'public.pem',
			'notes.bak',
			'dist/bundle.js',
		].forEach((file) => writeFileSync(joinPath('ghost', file), 'content', { flag: 'w' }));
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should exclude the files its own .gitignore lists', async () => {
		const paths = await getActorLocalFilePaths(joinPath('ghost'));

		expect(paths).toContain('main.js');
		expect(paths).toContain('src/index.js');
		expect(paths).not.toContain('secret.env');
	});

	it('should exclude the files the rules above it list', async () => {
		const paths = await getActorLocalFilePaths(joinPath('ghost'));

		expect(paths).not.toContain('x.log');
		expect(paths).not.toContain('src/y.log');
		expect(paths).not.toContain('key.pem');
		expect(paths).not.toContain('notes.bak');
	});

	it('should apply the rules above it in a subdirectory too', async () => {
		const paths = await getActorLocalFilePaths(joinPath('ghost', 'src'));

		expect(paths).toContain('index.js');
		expect(paths).not.toContain('y.log');
	});

	it('should let a deeper file re-include what a shallower one ignores, as git does', async () => {
		const paths = await getActorLocalFilePaths(joinPath('ghost'));

		expect(paths).toContain('src/keep.log');
		expect(paths).toContain('public.pem');
		expect(await getActorLocalFilePaths(joinPath('ghost', 'src'))).toContain('keep.log');
	});

	it('should include the files .actorignore force-includes', async () => {
		const paths = await getActorLocalFilePaths(joinPath('ghost'));

		expect(paths).toContain('dist/bundle.js');
	});
});

const IGNORED_TRACKED_DIR_TEST_DIR = 'gitignore-ignored-tracked-dir-test-dir';

describe('Utils - pushing a directory .gitignore ignores that holds a tracked file (git)', () => {
	// The root .gitignore ignores legacy/, which holds a file committed before. git lists the untracked files in it one by
	// one, not `./`, but the push applies the rules as it does for any ignored directory.
	const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath(IGNORED_TRACKED_DIR_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		execSync('git init', { cwd: tmpPath, stdio: 'ignore' });

		ensureFolderExistsSync(tmpPath, 'legacy');

		writeFileSync(joinPath('.gitignore'), 'legacy/\n*.log\n', { flag: 'w' });
		writeFileSync(joinPath('legacy', '.gitignore'), 'secret.env\n', { flag: 'w' });
		['tracked.js', 'main.js', 'secret.env', 'x.log'].forEach((file) =>
			writeFileSync(joinPath('legacy', file), 'content', { flag: 'w' }),
		);

		execSync('git add -f legacy/tracked.js', { cwd: tmpPath, stdio: 'ignore' });
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should apply every rule except the one that ignores the pushed directory', async () => {
		const paths = await getActorLocalFilePaths(joinPath('legacy'));

		expect(paths).toContain('tracked.js');
		expect(paths).toContain('main.js');
		expect(paths).toContain('.gitignore');
		expect(paths).not.toContain('secret.env');
		expect(paths).not.toContain('x.log');
	});
});

const IGNORED_DIR_SYMLINK_TEST_DIR = 'gitignore-ignored-dir-symlink-test-dir';

// Creating a symlink on Windows needs extra rights.
describe.skipIf(process.platform === 'win32')(
	'Utils - pushing a directory .gitignore ignores through a symlink (git)',
	() => {
		// The root .gitignore ignores actors/, and linked leads to actors/a. Git applies the rules by the real path, so
		// a push through the link applies the same rules as a push of actors/a.
		const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath(IGNORED_DIR_SYMLINK_TEST_DIR, {
			create: true,
			remove: true,
			cwd: false,
			cwdParent: false,
		});

		beforeAll(async () => {
			await beforeAllCalls();

			execSync('git init', { cwd: tmpPath, stdio: 'ignore' });

			mkdirSync(joinPath('actors', 'a', 'local'), { recursive: true });

			writeFileSync(joinPath('.gitignore'), 'actors/\n/actors/a/local/\n', { flag: 'w' });
			writeFileSync(joinPath('.git', 'info', 'exclude'), '*.pem\n', { flag: 'w' });
			['main.js', 'local/x.txt', 'key.pem'].forEach((file) =>
				writeFileSync(joinPath('actors', 'a', file), 'content', { flag: 'w' }),
			);
			symlinkSync(joinPath('actors', 'a'), joinPath('linked'), 'dir');
		});

		afterAll(async () => {
			await afterAllCalls();
		});

		it('should apply the rules by the real path', async () => {
			const paths = await getActorLocalFilePaths(joinPath('linked'));

			expect(paths).toContain('main.js');
			expect(paths).not.toContain('local/x.txt');
			expect(paths).not.toContain('key.pem');
		});
	},
);

const TRACKED_FILE_TEST_DIR = 'gitignore-tracked-file-test-dir';

describe('Utils - tracked file the .gitignore matches (git)', () => {
	// Git lists only untracked files, so a file committed before the rule stays in the upload, as it stays in the
	// repository.
	const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath(TRACKED_FILE_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		execSync('git init', { cwd: tmpPath, stdio: 'ignore' });

		['main.js', 'keep.log', 'other.log'].forEach((file) => writeFileSync(joinPath(file), 'content', { flag: 'w' }));
		writeFileSync(joinPath('.gitignore'), '*.log\n', { flag: 'w' });

		execSync('git add -f keep.log', { cwd: tmpPath, stdio: 'ignore' });
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should keep the tracked file, as git lists only untracked files', async () => {
		const paths = await getActorLocalFilePaths(tmpPath);

		expect(paths).toContain('main.js');
		expect(paths).toContain('keep.log');
		expect(paths).not.toContain('other.log');
	});
});

const MATCHER_TEST_DIR = 'gitignore-matcher-test-dir';

describe('Utils - getGitignoreMatcher asked directly (git)', () => {
	const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath(MATCHER_TEST_DIR, {
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

		['dist/bundle.js', 'src/index.js', 'x.log', 'x.logs'].forEach((file) =>
			writeFileSync(joinPath(file), 'content', { flag: 'w' }),
		);
		writeFileSync(joinPath('.gitignore'), 'dist/\n*.log\n', { flag: 'w' });
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should say an ignored directory asked with a trailing slash is ignored', async () => {
		const isGitignored = await getGitignoreMatcher(tmpPath);

		expect(isGitignored('dist/')).toBe(true);
		expect(isGitignored('src/')).toBe(false);
	});

	it('should not say a path that only starts with the name of an ignored file is ignored', async () => {
		const isGitignored = await getGitignoreMatcher(tmpPath);

		expect(isGitignored('x.log')).toBe(true);
		expect(isGitignored('x.logs')).toBe(false);
	});

	it('should drop the empty entry after the last NUL of the git listing', async () => {
		const isGitignored = await getGitignoreMatcher(tmpPath);

		expect(isGitignored('x.log')).toBe(true);
		// -z ends the listing with a NUL, so the split leaves an empty entry. '' is the only path it would match.
		expect(isGitignored('')).toBe(false);
	});
});

const NFD_DIR_TEST_DIR = 'gitignore-nfd-dir-test-dir';

describe('Utils - gitignored directory with a decomposed non-ASCII name (git)', () => {
	const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath(NFD_DIR_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		execSync('git init', { cwd: tmpPath, stdio: 'ignore' });
		// Git then prints names as stored, as it does on Linux and Windows.
		execSync('git config core.precomposeUnicode false', { cwd: tmpPath, stdio: 'ignore' });

		// Decomposed, as macOS archives and older macOS volumes store names.
		ensureFolderExistsSync(tmpPath, 'čaj'.normalize('NFD'));

		writeFileSync(joinPath('main.js'), 'content', { flag: 'w' });
		writeFileSync(joinPath('čaj'.normalize('NFD'), 'a.txt'), 'content', { flag: 'w' });

		// ASCII, so it matches either form.
		writeFileSync(joinPath('.gitignore'), '*aj/\n', { flag: 'w' });
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should exclude the files below it', async () => {
		const paths = (await getActorLocalFilePaths(tmpPath)).map((path) => path.normalize('NFC'));

		expect(paths).toContain('main.js');
		expect(paths).not.toContain('čaj/a.txt');
	});
});

const EXCLUDE_RANK_TEST_DIR = 'gitignore-exclude-rank-test-dir';

describe('Utils - pushing a directory .gitignore ignores ranks the exclude files as git does (git)', () => {
	// .git/info/exclude ranks above the global excludes file, and every .gitignore above both.
	const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath(EXCLUDE_RANK_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		execSync('git init', { cwd: tmpPath, stdio: 'ignore' });
		execSync('git config core.excludesFile global-excludes', { cwd: tmpPath, stdio: 'ignore' });

		ensureFolderExistsSync(tmpPath, 'ghost');

		writeFileSync(joinPath('global-excludes'), '*.bak\n', { flag: 'w' });
		writeFileSync(joinPath('.git', 'info', 'exclude'), '!keep.bak\n*.pem\n', { flag: 'w' });
		writeFileSync(joinPath('.gitignore'), 'ghost/\n!public.pem\n', { flag: 'w' });
		['main.js', 'keep.bak', 'other.bak', 'public.pem', 'key.pem'].forEach((file) =>
			writeFileSync(joinPath('ghost', file), 'content', { flag: 'w' }),
		);
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should let .git/info/exclude re-include what the global excludes file ignores', async () => {
		const paths = await getActorLocalFilePaths(joinPath('ghost'));

		expect(paths).toContain('main.js');
		expect(paths).toContain('keep.bak');
		expect(paths).not.toContain('other.bak');
	});

	it('should let a .gitignore re-include what .git/info/exclude ignores', async () => {
		const paths = await getActorLocalFilePaths(joinPath('ghost'));

		expect(paths).toContain('public.pem');
		expect(paths).not.toContain('key.pem');
	});
});

const IGNORING_LINES_TEST_DIR = 'gitignore-ignoring-lines-test-dir';

describe('Utils - pushing a directory a line above it ignores (git)', () => {
	// Whatever the form of the line that ignores the pushed directory, only that line is dropped. The other lines of its
	// file still apply, its ! lines among them.
	const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath(IGNORING_LINES_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		execSync('git init', { cwd: tmpPath, stdio: 'ignore' });

		['ghost', 'actors/a', 'actors/delta'].forEach((folder) => mkdirSync(joinPath(folder), { recursive: true }));

		writeFileSync(joinPath('.gitignore'), 'ghost*\na/\n*.log\n!keep.log\n', { flag: 'w' });
		writeFileSync(joinPath('.git', 'info', 'exclude'), 'actors/delta/\n*.pem\n', { flag: 'w' });
		[
			'ghost/main.js',
			'ghost/x.log',
			'ghost/keep.log',
			'actors/a/main.js',
			'actors/a/x.log',
			'actors/delta/main.js',
			'actors/delta/key.pem',
		].forEach((file) => writeFileSync(joinPath(file), 'content', { flag: 'w' }));
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should drop a line without a trailing slash', async () => {
		const paths = await getActorLocalFilePaths(joinPath('ghost'));

		expect(paths).toContain('main.js');
		expect(paths).not.toContain('x.log');
	});

	it('should drop a line without a slash that matches at any depth', async () => {
		const paths = await getActorLocalFilePaths(joinPath('actors', 'a'));

		expect(paths).toContain('main.js');
		expect(paths).not.toContain('x.log');
	});

	it('should keep the ! lines of the file', async () => {
		const paths = await getActorLocalFilePaths(joinPath('ghost'));

		expect(paths).toContain('keep.log');
	});

	it('should drop the line of .git/info/exclude', async () => {
		const paths = await getActorLocalFilePaths(joinPath('actors', 'delta'));

		expect(paths).toContain('main.js');
		expect(paths).not.toContain('key.pem');
	});
});

const NOT_A_REPOSITORY_TEST_DIR = 'gitignore-not-a-repository-test-dir';

describe('Utils - pushing an ignored directory with a .git that is not a repository (git)', () => {
	// inner/.git is an empty directory, so git answers from the outer repository, whose .gitignore ignores inner/. The
	// rules are read from inner/, the first directory with a .git, and the outer .git/info/exclude applies there.
	const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath(NOT_A_REPOSITORY_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		execSync('git init', { cwd: tmpPath, stdio: 'ignore' });

		mkdirSync(joinPath('inner', '.git'), { recursive: true });

		writeFileSync(joinPath('.gitignore'), 'inner/\n', { flag: 'w' });
		writeFileSync(joinPath('.git', 'info', 'exclude'), '*.pem\n', { flag: 'w' });
		['main.js', 'key.pem'].forEach((file) => writeFileSync(joinPath('inner', file), 'content', { flag: 'w' }));
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should apply .git/info/exclude', async () => {
		const paths = await getActorLocalFilePaths(joinPath('inner'));

		expect(paths).toContain('main.js');
		expect(paths).not.toContain('key.pem');
	});
});

const LINKED_WORKTREE_TEST_DIR = 'gitignore-linked-worktree-test-dir';

describe('Utils - pushing a directory .gitignore ignores in a linked worktree (git)', () => {
	// In a linked worktree .git is a file, and .git/info/exclude is the main repository's.
	const { joinPath, beforeAllCalls, afterAllCalls } = useTempPath(LINKED_WORKTREE_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		mkdirSync(joinPath('main'));
		execSync('git init', { cwd: joinPath('main'), stdio: 'ignore' });
		execSync('git -c user.name=Test -c user.email=test@example.com commit --quiet --allow-empty -m init', {
			cwd: joinPath('main'),
			stdio: 'ignore',
		});
		execSync(`git worktree add --detach "${joinPath('linked')}"`, { cwd: joinPath('main'), stdio: 'ignore' });

		mkdirSync(joinPath('linked', 'ghost'));

		writeFileSync(joinPath('main', '.git', 'info', 'exclude'), '*.pem\n', { flag: 'w' });
		writeFileSync(joinPath('linked', '.gitignore'), 'ghost/\n', { flag: 'w' });
		['main.js', 'key.pem'].forEach((file) =>
			writeFileSync(joinPath('linked', 'ghost', file), 'content', { flag: 'w' }),
		);
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should exclude the files the main repository .git/info/exclude lists', async () => {
		const paths = await getActorLocalFilePaths(joinPath('linked', 'ghost'));

		expect(paths).toContain('main.js');
		expect(paths).not.toContain('key.pem');
	});
});

const GLOBAL_EXCLUDES_TEST_DIR = 'gitignore-global-excludes-test-dir';

describe('Utils - the global excludes file when pushing a directory .gitignore ignores (git)', () => {
	// The root .gitignore ignores ghost/, so the push finds the global excludes file itself, as git does.
	const { joinPath, beforeAllCalls, afterAllCalls } = useTempPath(GLOBAL_EXCLUDES_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		mkdirSync(joinPath('repo', 'ghost'), { recursive: true });
		execSync('git init', { cwd: joinPath('repo'), stdio: 'ignore' });

		writeFileSync(joinPath('repo', '.gitignore'), 'ghost/\n', { flag: 'w' });
		['main.js', 'notes.bak'].forEach((file) =>
			writeFileSync(joinPath('repo', 'ghost', file), 'content', { flag: 'w' }),
		);
	});

	beforeEach(() => {
		try {
			execSync('git config --unset-all core.excludesFile', { cwd: joinPath('repo'), stdio: 'ignore' });
		} catch {
			// It wasn't set.
		}
	});

	afterEach(() => {
		stubGitHome();
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should apply no global excludes when the file does not exist', async () => {
		// The empty home holds no git/ignore.
		const paths = await getActorLocalFilePaths(joinPath('repo', 'ghost'));

		expect(paths).toContain('main.js');
		expect(paths).toContain('notes.bak');
	});

	it('should read core.excludesFile when it is an absolute path', async () => {
		writeFileSync(joinPath('elsewhere-excludes'), '*.bak\n', { flag: 'w' });
		execSync(`git config core.excludesFile "${joinPath('elsewhere-excludes').replaceAll('\\', '/')}"`, {
			cwd: joinPath('repo'),
			stdio: 'ignore',
		});

		const paths = await getActorLocalFilePaths(joinPath('repo', 'ghost'));

		expect(paths).toContain('main.js');
		expect(paths).not.toContain('notes.bak');
	});

	it('should expand a leading ~ in core.excludesFile to the home directory', async () => {
		mkdirSync(joinPath('home'), { recursive: true });
		writeFileSync(joinPath('home', 'my-excludes'), '*.bak\n', { flag: 'w' });
		stubGitHome(joinPath('home'));
		execSync('git config core.excludesFile "~/my-excludes"', { cwd: joinPath('repo'), stdio: 'ignore' });

		const paths = await getActorLocalFilePaths(joinPath('repo', 'ghost'));

		expect(paths).toContain('main.js');
		expect(paths).not.toContain('notes.bak');
	});

	it('should read $XDG_CONFIG_HOME/git/ignore when core.excludesFile is unset', async () => {
		mkdirSync(joinPath('xdg', 'git'), { recursive: true });
		writeFileSync(joinPath('xdg', 'git', 'ignore'), '*.bak\n', { flag: 'w' });
		stubGitHome(undefined, joinPath('xdg'));

		const paths = await getActorLocalFilePaths(joinPath('repo', 'ghost'));

		expect(paths).toContain('main.js');
		expect(paths).not.toContain('notes.bak');
	});

	it('should read ~/.config/git/ignore when XDG_CONFIG_HOME is unset', async () => {
		mkdirSync(joinPath('home-unset', '.config', 'git'), { recursive: true });
		writeFileSync(joinPath('home-unset', '.config', 'git', 'ignore'), '*.bak\n', { flag: 'w' });
		stubGitHome(joinPath('home-unset'));
		vitest.stubEnv('XDG_CONFIG_HOME', undefined);

		const paths = await getActorLocalFilePaths(joinPath('repo', 'ghost'));

		expect(paths).toContain('main.js');
		expect(paths).not.toContain('notes.bak');
	});

	it('should apply no global excludes when core.excludesFile is empty, as git does', async () => {
		mkdirSync(joinPath('xdg-off', 'git'), { recursive: true });
		writeFileSync(joinPath('xdg-off', 'git', 'ignore'), '*.bak\n', { flag: 'w' });
		stubGitHome(undefined, joinPath('xdg-off'));
		spawnSync('git', ['config', 'core.excludesFile', ''], { cwd: joinPath('repo'), stdio: 'ignore' });

		const paths = await getActorLocalFilePaths(joinPath('repo', 'ghost'));

		expect(paths).toContain('main.js');
		expect(paths).toContain('notes.bak');
	});

	it('should read ~/.config/git/ignore when XDG_CONFIG_HOME is empty, as git does', async () => {
		mkdirSync(joinPath('home-empty', '.config', 'git'), { recursive: true });
		writeFileSync(joinPath('home-empty', '.config', 'git', 'ignore'), '*.bak\n', { flag: 'w' });
		stubGitHome(joinPath('home-empty'), '');

		const paths = await getActorLocalFilePaths(joinPath('repo', 'ghost'));

		expect(paths).toContain('main.js');
		expect(paths).not.toContain('notes.bak');
	});
});

const GIT_ERRORS_TEST_DIR = 'gitignore-git-errors-test-dir';

describe('Utils - git errors (git)', () => {
	const { tmpPath, beforeAllCalls, afterAllCalls } = useTempPath(GIT_ERRORS_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should not print them when git fails', () => {
		// git writes to the terminal directly, so the push runs in a process of its own. GIT_DIR naming a missing
		// directory makes every git command fail with "fatal: not a git repository".
		const utils = new URL('../../../src/lib/utils.ts', import.meta.url).href;
		const script = `const { getActorLocalFilePaths } = await import(${JSON.stringify(utils)}); await getActorLocalFilePaths(process.cwd());`;
		const { status, stderr } = spawnSync(
			process.execPath,
			['--import', 'tsx', '--input-type=module', '--eval', script],
			{
				cwd: tmpPath,
				env: { ...process.env, GIT_DIR: `${tmpPath}-missing` },
				encoding: 'utf-8',
			},
		);

		expect(status).toBe(0);
		expect(stderr).not.toContain('fatal');
	});
});
