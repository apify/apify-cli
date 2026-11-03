import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import process from 'node:process';

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

// Lets a test see which files the push reads.
vi.mock('node:fs/promises', async (importOriginal) => {
	const original = await importOriginal<typeof import('node:fs/promises')>();
	return { ...original, readFile: vi.fn(original.readFile) };
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
		// The fake .git stops the walk here, so the apify-cli .gitignore doesn't apply.
		mkdirSync(joinPath('.git'));

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

		// The fake .git stops the walk here, so the apify-cli .gitignore doesn't apply.
		mkdirSync(joinPath('.git'));

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
		// The fake .git makes tmpPath the repository root, so the walk reads its
		// .gitignore and stops there, before the apify-cli .gitignore.
		mkdirSync(join(tmpPath, '.git'));
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

	it('should not apply the outer .gitignore when the pushed directory is the repository root', async () => {
		const paths = await getActorLocalFilePaths(joinPath('repo'));

		expect(paths).toContain('actors/a/outer.txt');
		expect(paths).not.toContain('actors/a/x.log');
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

const RANK_TEST_DIR = 'gitignore-rank-test-dir';

describe('Utils - a deeper .gitignore wins over the repository root one (no git)', () => {
	// As in git, the `!` lines of an Actor's own .gitignore re-include what the root .gitignore ignores, except below a
	// directory the root ignores.
	const { joinPath, beforeAllCalls, afterAllCalls } = useTempPath(RANK_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		mkdirSync(joinPath('.git'), { recursive: true });
		mkdirSync(joinPath('actors', 'a', 'dist'), { recursive: true });
		mkdirSync(joinPath('actors', 'a', 'build'), { recursive: true });
		writeFileSync(joinPath('.gitignore'), 'dist/\nbuild/\n*.log\n*.map\n');
		writeFileSync(joinPath('actors', 'a', '.gitignore'), '!dist/\n!keep.log\n!build/keep.js\n');
		['main.js', 'dist/bundle.js', 'dist/bundle.map', 'keep.log', 'other.log', 'build/keep.js'].forEach((file) =>
			writeFileSync(joinPath('actors', 'a', file), 'content'),
		);
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should include the files the deeper .gitignore re-includes', async () => {
		const paths = await getActorLocalFilePaths(joinPath('actors', 'a'));

		expect(paths).toContain('main.js');
		expect(paths).toContain('dist/bundle.js');
		expect(paths).toContain('keep.log');
		expect(paths).not.toContain('other.log');
		expect(paths).not.toContain('dist/bundle.map');
	});

	it('should keep a file below an ignored directory ignored', async () => {
		const paths = await getActorLocalFilePaths(joinPath('actors', 'a'));

		expect(paths).not.toContain('build/keep.js');
	});
});

const GIT_FILE_TEST_DIR = 'gitignore-git-file-test-dir';

describe('Utils - a .git file marks the repository root (no git)', () => {
	// In a linked worktree or a submodule, .git is a file. The .gitignore above it belongs to an outer repository.
	const { joinPath, beforeAllCalls, afterAllCalls } = useTempPath(GIT_FILE_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		mkdirSync(joinPath('worktree', 'actors', 'a'), { recursive: true });
		writeFileSync(joinPath('.gitignore'), 'outer.txt\n');
		writeFileSync(joinPath('worktree', '.git'), 'gitdir: ../elsewhere\n');
		writeFileSync(joinPath('worktree', '.gitignore'), '*.log\n');
		['main.js', 'x.log', 'outer.txt'].forEach((file) =>
			writeFileSync(joinPath('worktree', 'actors', 'a', file), 'content'),
		);
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should stop at a .git file as at a .git directory', async () => {
		const paths = await getActorLocalFilePaths(joinPath('worktree', 'actors', 'a'));

		expect(paths).toContain('main.js');
		expect(paths).toContain('outer.txt');
		expect(paths).not.toContain('x.log');
	});
});

describe('Utils - no repository above the pushed directory (no git)', () => {
	// Outside any repository, every .gitignore up to the filesystem root applies, scoped from there. test/tmp is inside
	// the apify-cli repository, so the files go to the system temp directory.
	let base: string;

	beforeAll(() => {
		base = mkdtempSync(join(tmpdir(), 'apify-cli-no-repo-'));
		mkdirSync(join(base, 'inner', 'build'), { recursive: true });
		writeFileSync(join(base, '.gitignore'), '*.secret\n/inner/build/\n');
		['main.js', 'x.secret', 'build/out.js'].forEach((file) => writeFileSync(join(base, 'inner', file), 'content'));
	});

	afterAll(() => {
		rmSync(base, { recursive: true, force: true });
	});

	it('should apply every .gitignore above it', async () => {
		const paths = await getActorLocalFilePaths(join(base, 'inner'));

		expect(paths).toContain('main.js');
		expect(paths).not.toContain('x.secret');
		expect(paths).not.toContain('build/out.js');
	});
});

const MIDDLE_TEST_DIR = 'gitignore-middle-test-dir';

describe('Utils - a .gitignore between the repository root and the pushed directory (no git)', () => {
	// actors/.gitignore ignores the pushed actors/a with an anchored line. Its other lines apply from actors/, and rank
	// above the root ones, as in git.
	const { joinPath, beforeAllCalls, afterAllCalls } = useTempPath(MIDDLE_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		mkdirSync(joinPath('.git'));
		mkdirSync(joinPath('actors', 'a', 'local'), { recursive: true });
		writeFileSync(joinPath('.gitignore'), '*.log\n');
		writeFileSync(joinPath('actors', '.gitignore'), '/a/\na/local/\n!keep.log\n');
		['main.js', 'keep.log', 'other.log', 'local/x.txt'].forEach((file) =>
			writeFileSync(joinPath('actors', 'a', file), 'content'),
		);
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should drop the line that ignores the pushed directory', async () => {
		const paths = await getActorLocalFilePaths(joinPath('actors', 'a'));

		expect(paths).toContain('main.js');
	});

	it('should anchor its lines to its own directory', async () => {
		const paths = await getActorLocalFilePaths(joinPath('actors', 'a'));

		expect(paths).not.toContain('local/x.txt');
	});

	it('should let its ! lines re-include what the root .gitignore ignores', async () => {
		const paths = await getActorLocalFilePaths(joinPath('actors', 'a'));

		expect(paths).toContain('keep.log');
		expect(paths).not.toContain('other.log');
	});
});

const RANK_INSIDE_TEST_DIR = 'gitignore-rank-inside-test-dir';

describe('Utils - a deeper .gitignore wins over a shallower one inside the pushed directory (no git)', () => {
	// The example from the issue, pushed from the root: both files are inside the pushed directory, so their order
	// decides.
	const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath(RANK_INSIDE_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		mkdirSync(joinPath('.git'));
		// '-' sorts before '.', so by name -sub/.gitignore would come before the root .gitignore.
		['sub', '-sub'].forEach((folder) => {
			mkdirSync(joinPath(folder));
			writeFileSync(joinPath(folder, '.gitignore'), '!keep.log\n');
		});
		writeFileSync(joinPath('.gitignore'), '*.log\n');
		['main.js', 'x.log', 'sub/keep.log', 'sub/other.log', '-sub/keep.log', '-sub/other.log'].forEach((file) =>
			writeFileSync(joinPath(file), 'content'),
		);
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should include the file the deeper .gitignore re-includes', async () => {
		const paths = await getActorLocalFilePaths(tmpPath);

		expect(paths).toContain('main.js');
		expect(paths).toContain('sub/keep.log');
		expect(paths).not.toContain('x.log');
		expect(paths).not.toContain('sub/other.log');
	});

	it('should rank the files by depth, not by name', async () => {
		const paths = await getActorLocalFilePaths(tmpPath);

		expect(paths).toContain('-sub/keep.log');
		expect(paths).not.toContain('-sub/other.log');
	});
});

const DOT_DIR_TEST_DIR = 'gitignore-dot-dir-test-dir';

describe('Utils - .gitignore inside a dot directory (no git)', () => {
	const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath(DOT_DIR_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		mkdirSync(joinPath('.git'));
		mkdirSync(joinPath('.config'));
		writeFileSync(joinPath('.config', '.gitignore'), 'secret.json\n');
		['secret.json', 'settings.json'].forEach((file) => writeFileSync(joinPath('.config', file), 'content'));
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should apply it', async () => {
		const paths = await getActorLocalFilePaths(tmpPath);

		expect(paths).toContain('.config/settings.json');
		expect(paths).not.toContain('.config/secret.json');
	});
});

const INSIDE_DOT_GIT_TEST_DIR = 'gitignore-inside-dot-git-test-dir';

describe('Utils - files inside .git (no git)', () => {
	const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath(INSIDE_DOT_GIT_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		mkdirSync(joinPath('.git', 'hooks'), { recursive: true });
		writeFileSync(joinPath('.git', 'hooks', '.gitignore'), '*\n');
		writeFileSync(joinPath('main.js'), 'content');
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should not read a .gitignore inside .git', async () => {
		vi.mocked(readFile).mockClear();

		await getActorLocalFilePaths(tmpPath);

		const readPaths = vi.mocked(readFile).mock.calls.map(([path]) => String(path));
		expect(readPaths.filter((path) => path.includes(`${sep}.git${sep}`))).toEqual([]);
	});
});

const UNREADABLE_TEST_DIR = 'gitignore-unreadable-test-dir';

// chmod 000 has no effect on Windows and root reads the file anyway.
describe.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
	'Utils - an unreadable .gitignore inside the pushed directory (no git)',
	() => {
		// Git skips such a file with a warning.
		const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath(UNREADABLE_TEST_DIR, {
			create: true,
			remove: true,
			cwd: false,
			cwdParent: false,
		});

		beforeAll(async () => {
			await beforeAllCalls();

			mkdirSync(joinPath('.git'));
			mkdirSync(joinPath('sub'));
			writeFileSync(joinPath('sub', '.gitignore'), '*\n');
			chmodSync(joinPath('sub', '.gitignore'), 0o000);
			['main.js', 'sub/x.js'].forEach((file) => writeFileSync(joinPath(file), 'content'));
		});

		afterAll(async () => {
			chmodSync(joinPath('sub', '.gitignore'), 0o644);
			await afterAllCalls();
		});

		it('should skip it', async () => {
			await expect(getActorLocalFilePaths(tmpPath)).resolves.toEqual(expect.arrayContaining(['main.js', 'sub/x.js']));
		});
	},
);

const MISSING_TEST_DIR = 'gitignore-missing-test-dir';

describe('Utils - pushing a directory that does not exist (no git)', () => {
	const { joinPath, beforeAllCalls, afterAllCalls } = useTempPath(MISSING_TEST_DIR, {
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

	it('should find no files', async () => {
		await expect(getActorLocalFilePaths(joinPath('missing'))).resolves.toEqual([]);
	});
});

const CRLF_TEST_DIR = 'gitignore-crlf-test-dir';

describe('Utils - .gitignore files with CRLF line endings (no git)', () => {
	// The pushed directory is actors/a. actors/.gitignore is above it, actors/a/src/.gitignore inside it.
	const { joinPath, beforeAllCalls, afterAllCalls } = useTempPath(CRLF_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		mkdirSync(joinPath('.git'));
		mkdirSync(joinPath('actors', 'a', 'src', 'cache'), { recursive: true });
		mkdirSync(joinPath('actors', 'a', 'src', 'lib', 'build'), { recursive: true });
		writeFileSync(joinPath('actors', '.gitignore'), '*.log\r\n\r\ncache/\r\n');
		writeFileSync(joinPath('actors', 'a', 'src', '.gitignore'), 'build/\r\n');
		['main.js', 'src/index.js', 'x.log', 'src/cache/c.txt', 'src/lib/build/out.js'].forEach((file) =>
			writeFileSync(joinPath('actors', 'a', file), 'content'),
		);
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should read a .gitignore above the pushed directory as with LF line endings', async () => {
		const paths = await getActorLocalFilePaths(joinPath('actors', 'a'));

		expect(paths).toContain('main.js');
		expect(paths).toContain('src/index.js');
		expect(paths).not.toContain('x.log');
		expect(paths).not.toContain('src/cache/c.txt');
	});

	it('should read a .gitignore inside the pushed directory as with LF line endings', async () => {
		const paths = await getActorLocalFilePaths(joinPath('actors', 'a'));

		expect(paths).not.toContain('src/lib/build/out.js');
	});
});

const NFC_TEST_DIR = 'gitignore-nfc-test-dir';

describe('Utils - non-ASCII names in another Unicode form than the rules (no git)', () => {
	// Git on macOS compares names in NFC. The rules and the names on disk can each be decomposed (NFD), as macOS
	// archives store names.
	const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath(NFC_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		mkdirSync(joinPath('.git'));
		mkdirSync(joinPath('čaj'.normalize('NFD'), 'local'), { recursive: true });
		writeFileSync(joinPath('.gitignore'), `${'kůň.log'.normalize('NFD')}\nžába.log\n/čaj/local/\n`);
		['main.js', 'kůň.log', 'žába.log'.normalize('NFD')].forEach((file) => writeFileSync(joinPath(file), 'content'));
		['main.js', 'local/x.txt'].forEach((file) => writeFileSync(joinPath('čaj'.normalize('NFD'), file), 'content'));
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should compare the rules and the paths in NFC', async () => {
		const paths = (await getActorLocalFilePaths(tmpPath)).map((path) => path.normalize('NFC'));

		expect(paths).toContain('main.js');
		expect(paths).not.toContain('kůň.log');
		expect(paths).not.toContain('žába.log');
	});

	it('should compare the path of the pushed directory in NFC too', async () => {
		const paths = await getActorLocalFilePaths(joinPath('čaj'.normalize('NFD')));

		expect(paths).toContain('main.js');
		expect(paths).not.toContain('local/x.txt');
	});
});

const NFC_TYPED_TEST_DIR = 'gitignore-nfc-typed-test-dir';

describe('Utils - pushing an ignored directory whose name is stored decomposed (no git)', () => {
	// The directory is stored decomposed (NFD), as macOS archives store names. The push names it composed (NFC), as a
	// keyboard types it, or as stored, as the current directory gives it. The line of the root .gitignore that ignores it
	// is in NFC.
	const { joinPath, beforeAllCalls, afterAllCalls } = useTempPath(NFC_TYPED_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		mkdirSync(joinPath('.git'));
		mkdirSync(joinPath('čaj'.normalize('NFD')));
		writeFileSync(joinPath('.gitignore'), `${'čaj'.normalize('NFC')}/\n*.log\n`);
		['main.js', 'x.log'].forEach((file) => writeFileSync(joinPath('čaj'.normalize('NFD'), file), 'content'));
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should drop the line that ignores it and apply the rest, named composed', async ({ skip }) => {
		const typed = joinPath('čaj'.normalize('NFC'));
		// Only a file system that ignores the Unicode form of names, as macOS does, finds the directory by this path.
		skip(!existsSync(typed), 'the file system tells the Unicode forms of names apart');

		const paths = await getActorLocalFilePaths(typed);

		expect(paths).toContain('main.js');
		expect(paths).not.toContain('x.log');
	});

	it('should drop the line that ignores it and apply the rest, named as stored', async () => {
		const paths = await getActorLocalFilePaths(joinPath('čaj'.normalize('NFD')));

		expect(paths).toContain('main.js');
		expect(paths).not.toContain('x.log');
	});
});

const NFD_RULE_TEST_DIR = 'gitignore-nfd-rule-test-dir';

describe('Utils - pushing a directory a line written decomposed ignores (no git)', () => {
	// The line of the root .gitignore is decomposed (NFD), as a file from a macOS archive may hold it, and the directory
	// is stored and pushed composed (NFC).
	const { joinPath, beforeAllCalls, afterAllCalls } = useTempPath(NFD_RULE_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		mkdirSync(joinPath('.git'));
		mkdirSync(joinPath('čaj'.normalize('NFC')));
		writeFileSync(joinPath('.gitignore'), `${'čaj'.normalize('NFD')}/\n*.log\n`);
		['main.js', 'x.log'].forEach((file) => writeFileSync(joinPath('čaj'.normalize('NFC'), file), 'content'));
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should drop the line that ignores it and apply the rest', async () => {
		const paths = await getActorLocalFilePaths(joinPath('čaj'.normalize('NFC')));

		expect(paths).toContain('main.js');
		expect(paths).not.toContain('x.log');
	});
});

const PARTLY_IGNORED_TEST_DIR = 'gitignore-partly-ignored-test-dir';

describe('Utils - a .gitignore that ignores the pushed directory only in part (no git)', () => {
	// `*` ignores a/, but `!*/` re-includes it, so the file doesn't ignore a/ and every line applies, as in git.
	const { joinPath, beforeAllCalls, afterAllCalls } = useTempPath(PARTLY_IGNORED_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		mkdirSync(joinPath('.git'));
		mkdirSync(joinPath('a'));
		writeFileSync(joinPath('.gitignore'), '*\n!*/\n!*.js\n');
		['main.js', 'notes.txt'].forEach((file) => writeFileSync(joinPath('a', file), 'content'));
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should apply every line', async () => {
		const paths = await getActorLocalFilePaths(joinPath('a'));

		expect(paths).toContain('main.js');
		expect(paths).not.toContain('notes.txt');
	});
});

const ANCHOR_TEST_DIR = 'gitignore-anchor-test-dir';

describe('Utils - a nested .gitignore scopes its patterns as git does (no git)', () => {
	// A pattern with a slash before its end matches only from sub/, one without matches at any depth below it.
	const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath(ANCHOR_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		mkdirSync(joinPath('.git'));
		['sub/docs', 'sub/cache', 'sub/deep/docs', 'sub/deep/cache', 'sub2'].forEach((folder) =>
			mkdirSync(joinPath(folder), { recursive: true }),
		);
		writeFileSync(joinPath('sub', '.gitignore'), '/top.txt\ndocs/draft.md\ncache/\n*.log\n');
		[
			'sub/keep.js',
			'sub/top.txt',
			'sub/deep/top.txt',
			'sub/docs/draft.md',
			'sub/deep/docs/draft.md',
			'sub/cache/a.txt',
			'sub/deep/cache/b.txt',
			'sub/x.log',
			'sub/deep/y.log',
			'sub2/z.log',
		].forEach((file) => writeFileSync(joinPath(file), 'content'));
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should anchor a pattern with a slash before its end to the directory of the .gitignore', async () => {
		const paths = await getActorLocalFilePaths(tmpPath);

		expect(paths).toContain('sub/keep.js');
		expect(paths).not.toContain('sub/top.txt');
		expect(paths).toContain('sub/deep/top.txt');
		expect(paths).not.toContain('sub/docs/draft.md');
		expect(paths).toContain('sub/deep/docs/draft.md');
	});

	it('should match a pattern without a slash before its end at any depth', async () => {
		const paths = await getActorLocalFilePaths(tmpPath);

		expect(paths).not.toContain('sub/cache/a.txt');
		expect(paths).not.toContain('sub/deep/cache/b.txt');
		expect(paths).not.toContain('sub/x.log');
		expect(paths).not.toContain('sub/deep/y.log');
	});

	it('should not apply its patterns to a sibling directory', async () => {
		const paths = await getActorLocalFilePaths(tmpPath);

		expect(paths).toContain('sub2/z.log');
	});
});

const LINES_TEST_DIR = 'gitignore-lines-test-dir';

describe('Utils - comments, blank lines and trailing spaces in a nested .gitignore (no git)', () => {
	const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath(LINES_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		mkdirSync(joinPath('.git'));
		['sub/build', 'sub/deep', 'other/deep/cache'].forEach((folder) => mkdirSync(joinPath(folder), { recursive: true }));
		writeFileSync(joinPath('.gitignore'), 'build/\n*.txt\n');
		// A comment, a ! line whose pattern starts with #, a lone ! and a line of spaces.
		writeFileSync(joinPath('sub', '.gitignore'), '#hash.md\n!#keep.txt\n!\n   \n');
		// In a file of its own, so the line of spaces above doesn't hide it.
		writeFileSync(joinPath('other', '.gitignore'), 'cache/ \n');
		[
			'sub/#hash.md',
			'sub/#keep.txt',
			'sub/other.txt',
			'sub/build/out.js',
			'sub/deep/main.js',
			'other/deep/cache/b.js',
		].forEach((file) => writeFileSync(joinPath(file), 'content'));
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should not treat a comment as a pattern', async () => {
		const paths = await getActorLocalFilePaths(tmpPath);

		expect(paths).toContain('sub/#hash.md');
	});

	it('should keep a ! line whose pattern starts with #', async () => {
		const paths = await getActorLocalFilePaths(tmpPath);

		expect(paths).toContain('sub/#keep.txt');
		expect(paths).not.toContain('sub/other.txt');
	});

	it('should ignore a lone !', async () => {
		const paths = await getActorLocalFilePaths(tmpPath);

		expect(paths).not.toContain('sub/build/out.js');
	});

	it('should ignore a line of spaces', async () => {
		const paths = await getActorLocalFilePaths(tmpPath);

		expect(paths).toContain('sub/deep/main.js');
	});

	it('should drop the trailing spaces of a pattern', async () => {
		const paths = await getActorLocalFilePaths(tmpPath);

		expect(paths).not.toContain('other/deep/cache/b.js');
	});
});

const ESCAPED_SPACE_TEST_DIR = 'gitignore-escaped-space-test-dir';

// Windows doesn't allow a file name that ends with a space.
describe.skipIf(process.platform === 'win32')(
	'Utils - an escaped trailing space in a nested .gitignore (no git)',
	() => {
		const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath(ESCAPED_SPACE_TEST_DIR, {
			create: true,
			remove: true,
			cwd: false,
			cwdParent: false,
		});

		beforeAll(async () => {
			await beforeAllCalls();

			mkdirSync(joinPath('.git'));
			mkdirSync(joinPath('sub'));
			writeFileSync(joinPath('sub', '.gitignore'), 'name\\ \n');
			['sub/name ', 'sub/name'].forEach((file) => writeFileSync(joinPath(file), 'content'));
		});

		afterAll(async () => {
			await afterAllCalls();
		});

		it('should keep the escaped space', async () => {
			const paths = await getActorLocalFilePaths(tmpPath);

			expect(paths).not.toContain('sub/name ');
			expect(paths).toContain('sub/name');
		});
	},
);

const PATTERN_DIR_NAMES_TEST_DIR = 'gitignore-pattern-dir-names-test-dir';

describe('Utils - .gitignore files in directories whose names look like patterns (no git)', () => {
	// The directory name starts each scoped line, so its [ and a leading ! or # must match literally.
	const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath(PATTERN_DIR_NAMES_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		mkdirSync(joinPath('.git'));
		['[ab]', 'a', '!neg/inner', '#hash'].forEach((folder) => mkdirSync(joinPath(folder), { recursive: true }));
		['[ab]', '!neg', '#hash'].forEach((folder) => writeFileSync(joinPath(folder, '.gitignore'), '*.log\n'));
		['[ab]/x.log', '[ab]/main.js', 'a/y.log', '!neg/x.log', '!neg/inner/z.log', '#hash/x.log'].forEach((file) =>
			writeFileSync(joinPath(file), 'content'),
		);
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should apply the rules to that directory only', async () => {
		const paths = await getActorLocalFilePaths(tmpPath);

		expect(paths).toContain('[ab]/main.js');
		expect(paths).not.toContain('[ab]/x.log');
		expect(paths).toContain('a/y.log');
		expect(paths).not.toContain('!neg/x.log');
		expect(paths).not.toContain('#hash/x.log');
	});

	it('should apply the rules of such a directory above the pushed one', async () => {
		const paths = await getActorLocalFilePaths(joinPath('!neg', 'inner'));

		expect(paths).not.toContain('z.log');
	});
});

const GLOB_DIR_NAMES_TEST_DIR = 'gitignore-glob-dir-names-test-dir';

// Windows doesn't allow *, ? or \ in a file name.
describe.skipIf(process.platform === 'win32')(
	'Utils - .gitignore files in directories whose names hold *, ? or \\ (no git)',
	() => {
		const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath(GLOB_DIR_NAMES_TEST_DIR, {
			create: true,
			remove: true,
			cwd: false,
			cwdParent: false,
		});

		beforeAll(async () => {
			await beforeAllCalls();

			mkdirSync(joinPath('.git'));
			['a*b', 'aXb', 'c?d', 'cXd', 'e\\f', 'a*b*c', 'a*bXc'].forEach((folder) => mkdirSync(joinPath(folder)));
			['a*b', 'c?d', 'e\\f', 'a*b*c'].forEach((folder) => writeFileSync(joinPath(folder, '.gitignore'), '*.log\n'));
			['a*b/x.log', 'aXb/y.log', 'c?d/x.log', 'cXd/y.log', 'e\\f/x.log', 'a*b*c/x.log', 'a*bXc/y.log'].forEach((file) =>
				writeFileSync(joinPath(file), 'content'),
			);
		});

		afterAll(async () => {
			await afterAllCalls();
		});

		it('should apply the rules to that directory only', async () => {
			const paths = await getActorLocalFilePaths(tmpPath);

			expect(paths).not.toContain('a*b/x.log');
			expect(paths).toContain('aXb/y.log');
			expect(paths).not.toContain('c?d/x.log');
			expect(paths).toContain('cXd/y.log');
			expect(paths).not.toContain('e\\f/x.log');
		});

		it('should match every glob character of the name literally', async () => {
			const paths = await getActorLocalFilePaths(tmpPath);

			expect(paths).not.toContain('a*b*c/x.log');
			expect(paths).toContain('a*bXc/y.log');
		});
	},
);

const NO_EXCLUDES_TEST_DIR = 'gitignore-no-excludes-test-dir';

describe('Utils - exclude files when git is unavailable (no git)', () => {
	// Git names .git/info/exclude and the global excludes file, so without git only the .gitignore files apply.
	const { joinPath, beforeAllCalls, afterAllCalls } = useTempPath(NO_EXCLUDES_TEST_DIR, {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		mkdirSync(joinPath('repo', '.git', 'info'), { recursive: true });
		mkdirSync(joinPath('home', '.config', 'git'), { recursive: true });
		mkdirSync(joinPath('xdg', 'git'), { recursive: true });
		writeFileSync(joinPath('repo', '.git', 'info', 'exclude'), '*.pem\n');
		writeFileSync(joinPath('home', '.config', 'git', 'ignore'), '*.bak\n');
		writeFileSync(joinPath('xdg', 'git', 'ignore'), '*.bak\n');
		writeFileSync(joinPath('repo', '.gitignore'), '*.log\n');
		['main.js', 'x.log', 'key.pem', 'notes.bak'].forEach((file) => writeFileSync(joinPath('repo', file), 'content'));
	});

	afterEach(() => {
		vitest.unstubAllEnvs();
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should apply neither .git/info/exclude nor the global excludes file', async () => {
		// os.homedir() reads USERPROFILE on Windows and HOME elsewhere.
		vitest.stubEnv('HOME', joinPath('home'));
		vitest.stubEnv('USERPROFILE', joinPath('home'));
		vitest.stubEnv('XDG_CONFIG_HOME', joinPath('xdg'));

		const paths = await getActorLocalFilePaths(joinPath('repo'));

		expect(paths).toContain('main.js');
		expect(paths).not.toContain('x.log');
		expect(paths).toContain('key.pem');
		expect(paths).toContain('notes.bak');
	});
});
