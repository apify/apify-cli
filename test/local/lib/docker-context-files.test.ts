import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { getContextFilePaths } from '../../../src/lib/docker-context.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';

// vi.mock is hoisted before imports, so both the context collector and utils.ts get the mocked version. With
// `gitAvailable` off, every git call fails as it does without git, which sends the collector down its fallback.
const gitState = vi.hoisted(() => ({ gitAvailable: true }));
vi.mock('node:child_process', async (importOriginal) => {
	const original = await importOriginal<typeof import('node:child_process')>();
	const unavailable = () => {
		throw new Error('not a git repository');
	};
	return {
		...original,
		execSync: ((...args: Parameters<typeof original.execSync>) =>
			gitState.gitAvailable ? original.execSync(...args) : unavailable()) as typeof original.execSync,
		execFileSync: ((...args: Parameters<typeof original.execFileSync>) =>
			gitState.gitAvailable ? original.execFileSync(...args) : unavailable()) as typeof original.execFileSync,
	};
});

const ACTOR_PATH = 'actors/x';

describe('getContextFilePaths', () => {
	describe('inside a Git repository', () => {
		const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath('docker-context-files-test-dir', {
			create: true,
			remove: true,
			cwd: false,
			cwdParent: false,
		});

		const write = (relativePath: string, content = 'content') => {
			mkdirSync(dirname(joinPath(relativePath)), { recursive: true });
			writeFileSync(joinPath(relativePath), content);
		};
		const git = (...args: string[]) => execFileSync('git', args, { cwd: tmpPath, stdio: 'ignore' });

		beforeAll(async () => {
			await beforeAllCalls();

			write('package.json', '{}');
			// Git sorts names by their bytes, so this name comes first in its list.
			write(' notes.txt');
			write('.gitignore', 'dist\n');
			write('shared/Dockerfile', 'FROM apify/actor-node:20\n');
			write(`${ACTOR_PATH}/.actor/actor.json`, '{}');
			write(`${ACTOR_PATH}/src/index.ts`);
			write(`${ACTOR_PATH}/.actorignore`, '!dist/\nsrc/index.ts\n');
			write('packages/utils/src/index.ts');
			write('node_modules/tracked/index.js');
			git('init', '--quiet');
			git('add', '.');
			git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '-m', 'init');

			// After the commit: untracked, git-ignored, deleted and linked files, as a working copy has them.
			write('shared/start.sh');
			write(`${ACTOR_PATH}/dist/main.js`);
			write('node_modules/untracked/index.js');
			write('storage/key_value_stores/default/INPUT.json');
			write('packages/db/src/storage/kv.ts');
			rmSync(joinPath('packages/utils/src/index.ts'));
			symlinkSync('../../shared', joinPath(`${ACTOR_PATH}/shared`));
		});

		afterAll(async () => {
			await afterAllCalls();
		});

		it('lists the tracked files and the untracked files Git does not ignore, with forward slashes', async () => {
			const paths = await getContextFilePaths(tmpPath);

			expect(paths).toEqual(
				expect.arrayContaining([
					'package.json',
					'.gitignore',
					'shared/Dockerfile',
					`${ACTOR_PATH}/.actor/actor.json`,
					// Tracked, so in the clone, although .actorignore excludes it.
					`${ACTOR_PATH}/src/index.ts`,
					'shared/start.sh',
				]),
			);
			// Git-ignored, so not in the clone, whatever .actorignore force-includes.
			expect(paths).not.toContain(`${ACTOR_PATH}/dist/main.js`);
		});

		it('keeps the space at the start of a name', async () => {
			expect(await getContextFilePaths(tmpPath)).toContain(' notes.txt');
		});

		it('skips a tracked file that is deleted locally', async () => {
			expect(await getContextFilePaths(tmpPath)).not.toContain('packages/utils/src/index.ts');
		});

		it('drops node_modules and local run state from the untracked files only, but keeps a source folder named storage', async () => {
			const paths = await getContextFilePaths(tmpPath);

			expect(paths).toContain('node_modules/tracked/index.js');
			expect(paths).not.toContain('node_modules/untracked/index.js');
			expect(paths).not.toContain('storage/key_value_stores/default/INPUT.json');
			expect(paths).toContain('packages/db/src/storage/kv.ts');
		});

		it('keeps a symlink, as a Git clone does', async () => {
			expect(await getContextFilePaths(tmpPath)).toContain(`${ACTOR_PATH}/shared`);
		});
	});

	describe('during an unresolved merge', () => {
		const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath('docker-context-files-merge-dir', {
			create: true,
			remove: true,
			cwd: false,
			cwdParent: false,
		});

		const git = (...args: string[]) =>
			execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], {
				cwd: tmpPath,
				stdio: 'ignore',
			});

		beforeAll(async () => {
			await beforeAllCalls();

			git('init', '--quiet');
			writeFileSync(joinPath('shared.txt'), 'base\n');
			git('add', '.');
			git('commit', '--quiet', '-m', 'base');
			git('checkout', '--quiet', '-b', 'other');
			writeFileSync(joinPath('shared.txt'), 'other\n');
			git('commit', '--quiet', '-am', 'other');
			git('checkout', '--quiet', '-');
			writeFileSync(joinPath('shared.txt'), 'main\n');
			git('commit', '--quiet', '-am', 'main');
			// The merge stops on the conflict and leaves shared.txt in the index once per stage.
			expect(() => git('merge', '--quiet', 'other')).toThrow();
		});

		afterAll(async () => {
			await afterAllCalls();
		});

		it('lists a conflicted path once', async () => {
			expect(await getContextFilePaths(tmpPath)).toEqual(['shared.txt']);
		});
	});

	describe('with a file list over 1 MiB', () => {
		const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath('docker-context-files-large-dir', {
			create: true,
			remove: true,
			cwd: false,
			cwdParent: false,
		});

		beforeAll(async () => {
			await beforeAllCalls();
			writeFileSync(joinPath('package.json'), '{}');
			execFileSync('git', ['init', '--quiet'], { cwd: tmpPath, stdio: 'ignore' });
			// A workspace package's own node_modules, which no .gitignore covers: Git lists over 1 MiB of untracked names.
			const dependency = joinPath('packages/utils/node_modules/dependency');
			mkdirSync(dependency, { recursive: true });
			for (let i = 0; i < 5000; i++) writeFileSync(join(dependency, `${i}-${'x'.repeat(200)}.js`), '');
		});

		afterAll(async () => {
			await afterAllCalls();
		});

		it('still lists the files as Git has them, without the untracked node_modules', async () => {
			expect(await getContextFilePaths(tmpPath)).toEqual(['package.json']);
		});
	});

	describe('without git', () => {
		const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath('docker-context-files-no-git-dir', {
			create: true,
			remove: true,
			cwd: false,
			cwdParent: false,
		});

		beforeAll(async () => {
			await beforeAllCalls();
			mkdirSync(joinPath('src'), { recursive: true });
			writeFileSync(joinPath('main.js'), 'content');
			writeFileSync(joinPath('src/index.js'), 'content');
			writeFileSync(joinPath('debug.log'), 'content');
			writeFileSync(joinPath('.actorignore'), 'debug.log\n');
			// Dependencies and local run state of a package below the root, which the ordinary list only drops at the
			// top, and source folders that are only named like storage.
			for (const file of [
				'packages/lib/node_modules/dep/index.js',
				'packages/lib/storage/key_value_stores/default/INPUT.json',
				'packages/lib/apify_storage/datasets/default/000000001.json',
				'packages/lib/crawlee_storage/request_queues/default/entry.json',
				'packages/lib/src/storage/kv.js',
				'packages/lib/src/storage/datasets/index.js',
				'packages/lib/index.js',
			]) {
				mkdirSync(dirname(joinPath(file)), { recursive: true });
				writeFileSync(joinPath(file), '{}');
			}
			// Ends the walk for .gitignore files here, so the rules of this checkout don't apply.
			mkdirSync(joinPath('.git'));
			gitState.gitAvailable = false;
		});

		afterAll(async () => {
			gitState.gitAvailable = true;
			await afterAllCalls();
		});

		it('falls back to the ordinary file list, which applies .actorignore', async () => {
			const paths = await getContextFilePaths(tmpPath);

			expect(paths).toEqual(expect.arrayContaining(['main.js', 'src/index.js']));
			expect(paths).not.toContain('debug.log');
		});

		it('drops node_modules and local run state at any depth, as for untracked files in Git', async () => {
			const paths = await getContextFilePaths(tmpPath);

			expect(paths.filter((path) => path.startsWith('packages/lib/')).sort()).toEqual([
				'packages/lib/index.js',
				'packages/lib/src/storage/datasets/index.js',
				'packages/lib/src/storage/kv.js',
			]);
		});
	});
});
