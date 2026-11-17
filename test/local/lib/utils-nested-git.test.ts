import { execFileSync } from 'node:child_process';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import process from 'node:process';

import { getActorLocalFilePaths } from '../../../src/lib/utils.js';
import { useIsolatedGit } from '../../__setup__/hooks/useIsolatedGit.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';

useIsolatedGit('nested-git-home');

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'ignore' });

const gitPaths = (paths: string[]) => paths.filter((path) => path.split('/').includes('.git'));

describe('Utils - Git internals below the top level of the Actor directory (git)', () => {
	const { joinPath, beforeAllCalls, afterAllCalls } = useTempPath('nested-git-test-dir', {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		['main.js', '.gitignore', '.github/ci.yml', 'vendor/lib/index.js', 'packages/sub/index.js'].forEach((file) => {
			mkdirSync(dirname(joinPath('actor', file)), { recursive: true });
			writeFileSync(joinPath('actor', file), 'content', { flag: 'w' });
		});

		git(joinPath('actor'), 'init');
		// An untracked clone. Git lists it as a directory, not as ignored, so the .gitignore rules keep it.
		git(joinPath('actor', 'vendor', 'lib'), 'init');
		// Like a submodule or a linked worktree, it has a .git file that points to its Git directory.
		git(joinPath('actor', 'packages', 'sub'), 'init', '--separate-git-dir', joinPath('sub.git'));
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should exclude the .git directory at the top level', async () => {
		const paths = await getActorLocalFilePaths(joinPath('actor'));

		expect(paths).toContain('main.js');
		expect(paths.filter((path) => path.startsWith('.git/'))).toEqual([]);
	});

	it('should exclude the .git directory of a nested repository', async () => {
		const paths = await getActorLocalFilePaths(joinPath('actor'));

		expect(paths).toContain('vendor/lib/index.js');
		expect(gitPaths(paths).filter((path) => path.startsWith('vendor/lib/'))).toEqual([]);
	});

	it('should exclude the .git file of a submodule or linked worktree', async () => {
		const paths = await getActorLocalFilePaths(joinPath('actor'));

		expect(paths).toContain('packages/sub/index.js');
		expect(paths).not.toContain('packages/sub/.git');
	});

	it('should keep files whose names only start with .git', async () => {
		const paths = await getActorLocalFilePaths(joinPath('actor'));

		expect(paths).toContain('main.js');
		expect(paths).toContain('.gitignore');
		expect(paths).toContain('.github/ci.yml');
	});
});

// Creating a symlink on Windows needs extra rights.
describe.skipIf(process.platform === 'win32')('Utils - symlink to an ancestor directory (git)', () => {
	const { joinPath, beforeAllCalls, afterAllCalls } = useTempPath('nested-git-ancestor-symlink-test-dir', {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeAll(async () => {
		await beforeAllCalls();

		mkdirSync(joinPath('repo', 'actors', 'a'), { recursive: true });
		git(joinPath('repo'), 'init');

		writeFileSync(joinPath('repo', 'actors', 'a', 'main.js'), 'content', { flag: 'w' });
		symlinkSync(joinPath('repo'), joinPath('repo', 'actors', 'a', 'root'), 'dir');
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	it('should exclude the .git directory of the ancestor', async () => {
		const paths = await getActorLocalFilePaths(joinPath('repo', 'actors', 'a'));

		expect(paths).toContain('main.js');
		expect(gitPaths(paths)).toEqual([]);
	});
});
