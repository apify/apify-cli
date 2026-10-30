import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ensureFolderExistsSync } from '../../../src/lib/files.js';
import { getActorLocalFilePaths } from '../../../src/lib/utils.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';

// Mock execSync to simulate git not being available.
// vi.mock is hoisted before imports, so utils.ts gets the mocked version.
vi.mock('node:child_process', async (importOriginal) => {
	const original = await importOriginal<typeof import('node:child_process')>();
	return {
		...original,
		execSync: () => {
			throw new Error('not a git repository');
		},
	};
});

const TEST_DIR = 'gitignore-fallback-test-dir';
const FOLDERS = ['src', 'src/utils'];
const FOLDERS_TO_IGNORE = ['dist', 'src/generated'];
const FILES = ['main.js', 'src/index.js', 'src/utils/helper.js'];
const FILES_IN_IGNORED_DIR = ['dist/bundle.js', 'src/generated/types.js'];
const FILES_TO_IGNORE = ['debug.log'];

describe('Utils - gitignore fallback (no git)', () => {
	const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath(TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		// NOTE: No git init here — execSync is mocked to throw, triggering the fallback path.

		FOLDERS.concat(FOLDERS_TO_IGNORE).forEach((folder) => {
			ensureFolderExistsSync(tmpPath, folder);
		});

		FILES.concat(FILES_TO_IGNORE, FILES_IN_IGNORED_DIR).forEach((file) =>
			writeFileSync(joinPath(file), 'content', { flag: 'w' }),
		);

		const toIgnore = FOLDERS_TO_IGNORE.concat(FILES_TO_IGNORE).join('\n');
		writeFileSync(joinPath('.gitignore'), toIgnore, { flag: 'w' });
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should exclude files listed in .gitignore when git is unavailable', async () => {
		const paths = await getActorLocalFilePaths(tmpPath);

		FILES.forEach((file) => expect(paths).toContain(file));
		FILES_IN_IGNORED_DIR.concat(FILES_TO_IGNORE).forEach((file) => expect(paths).not.toContain(file));
	});
});

const NESTED_TEST_DIR = 'gitignore-nested-test-dir';

describe('Utils - nested .gitignore scoping (no git)', () => {
	const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath(NESTED_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		// Create directory structure
		ensureFolderExistsSync(tmpPath, 'src');
		ensureFolderExistsSync(tmpPath, 'src/internal');

		// Create files: one public, one that should be scoped-ignored by src/.gitignore
		writeFileSync(joinPath('src/public.js'), 'content', { flag: 'w' });
		writeFileSync(joinPath('src/internal/secret.js'), 'content', { flag: 'w' });

		// Only a nested .gitignore — the root has no entry for src/internal
		writeFileSync(joinPath('src/.gitignore'), 'internal/', { flag: 'w' });
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should exclude files matched by a nested .gitignore scoped to its own directory', async () => {
		const paths = await getActorLocalFilePaths(tmpPath);

		// src/public.js should be present
		expect(paths).toContain('src/public.js');

		// src/internal/secret.js should be excluded by src/.gitignore's `internal/` rule
		expect(paths).not.toContain('src/internal/secret.js');
	});
});

const PARENT_TEST_DIR = 'gitignore-parent-test-dir';

describe('Utils - parent .gitignore applied to subproject (no git)', () => {
	// tmpPath is the "project root" that holds the parent .gitignore.
	// The actual cwd passed to getActorLocalFilePaths is tmpPath/subproject/.
	const { tmpPath, beforeAllCalls, afterAllCalls } = useTempPath(PARENT_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	let subprojectPath: string;

	beforeAll(async () => {
		await beforeAllCalls();

		subprojectPath = join(tmpPath, 'subproject');

		// Parent .gitignore — rules that should apply to everything inside subproject/.
		// No fake .git is needed. The walk ends with the .gitignore of the apify-cli
		// repo root, and drops its lines that ignore test/tmp.
		writeFileSync(join(tmpPath, '.gitignore'), '*.secret\nbuild/\n', { flag: 'w' });

		// Subproject directory structure
		mkdirSync(subprojectPath, { recursive: true });
		ensureFolderExistsSync(subprojectPath, 'src');
		ensureFolderExistsSync(subprojectPath, 'build');

		// Files that should be kept
		writeFileSync(join(subprojectPath, 'main.js'), 'content', { flag: 'w' });
		writeFileSync(join(subprojectPath, 'src', 'utils.js'), 'content', { flag: 'w' });

		// Files/dirs that should be excluded by parent .gitignore
		writeFileSync(join(subprojectPath, 'config.secret'), 'content', { flag: 'w' });
		writeFileSync(join(subprojectPath, 'src', 'db.secret'), 'content', { flag: 'w' });
		writeFileSync(join(subprojectPath, 'build', 'output.js'), 'content', { flag: 'w' });
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should exclude files matched by *.secret pattern in parent .gitignore', async () => {
		const paths = await getActorLocalFilePaths(subprojectPath);

		expect(paths).toContain('main.js');
		expect(paths).toContain('src/utils.js');

		expect(paths).not.toContain('config.secret');
		expect(paths).not.toContain('src/db.secret');
	});

	it('should exclude directory matched by build/ pattern in parent .gitignore', async () => {
		const paths = await getActorLocalFilePaths(subprojectPath);

		expect(paths).not.toContain('build/output.js');
	});
});

const ROOT_TEST_DIR = 'gitignore-root-test-dir';

describe('Utils - repository root .gitignore applied to a subdirectory (no git)', () => {
	// repo/ has a .git, so it's the repository root. The .gitignore above it belongs to an outer repository.
	const { joinPath, beforeAllCalls, afterAllCalls } = useTempPath(ROOT_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		mkdirSync(joinPath('repo', '.git'), { recursive: true });
		mkdirSync(joinPath('repo', 'actors', 'a', 'root-ignored'), { recursive: true });
		writeFileSync(joinPath('.gitignore'), 'outer.txt\n');
		writeFileSync(joinPath('repo', '.gitignore'), '*.log\nroot-ignored/\n');
		['main.js', 'x.log', 'root-ignored/f.txt', 'outer.txt'].forEach((file) =>
			writeFileSync(joinPath('repo', 'actors', 'a', file), 'content'),
		);
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should exclude files matched by the repository root .gitignore, but not by an outer one', async () => {
		const paths = await getActorLocalFilePaths(joinPath('repo', 'actors', 'a'));

		expect(paths).toContain('main.js');
		expect(paths).toContain('outer.txt');
		expect(paths).not.toContain('x.log');
		expect(paths).not.toContain('root-ignored/f.txt');
	});
});

const IGNORED_DIR_TEST_DIR = 'gitignore-ignored-dir-test-dir';

describe('Utils - pushing a directory .gitignore ignores (no git)', () => {
	// The root .gitignore ignores ghost/, which is pushed explicitly. Its other rules still apply, and so does
	// ghost/.gitignore.
	const { joinPath, beforeAllCalls, afterAllCalls } = useTempPath(IGNORED_DIR_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		mkdirSync(joinPath('.git'), { recursive: true });
		mkdirSync(joinPath('ghost', 'src'), { recursive: true });
		writeFileSync(joinPath('.gitignore'), 'ghost/\n*.log\n');
		writeFileSync(joinPath('ghost', '.gitignore'), 'secret.env\n');
		['main.js', 'src/index.js', 'secret.env', 'x.log'].forEach((file) =>
			writeFileSync(joinPath('ghost', file), 'content'),
		);
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should apply every rule except the one that ignores the pushed directory', async () => {
		const paths = await getActorLocalFilePaths(joinPath('ghost'));

		expect(paths).toContain('main.js');
		expect(paths).toContain('src/index.js');
		expect(paths).not.toContain('secret.env');
		expect(paths).not.toContain('x.log');
	});
});
