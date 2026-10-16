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
			rmSync(joinPath('packages/utils/src/index.ts'));
			symlinkSync('../../shared', joinPath(`${ACTOR_PATH}/shared`));
		});

		afterAll(async () => {
			await afterAllCalls();
		});

		it('lists the tracked files and the untracked files Git does not ignore', async () => {
			const paths = await getContextFilePaths(tmpPath);

			expect(paths).toEqual(
				expect.arrayContaining([
					'package.json',
					'.gitignore',
					join('shared', 'Dockerfile'),
					join(ACTOR_PATH, '.actor', 'actor.json'),
					join(ACTOR_PATH, 'src', 'index.ts'),
					join('shared', 'start.sh'),
				]),
			);
			expect(paths).not.toContain(join(ACTOR_PATH, 'dist', 'main.js'));
		});

		it('skips a tracked file that is deleted locally', async () => {
			expect(await getContextFilePaths(tmpPath)).not.toContain(join('packages', 'utils', 'src', 'index.ts'));
		});

		it('drops node_modules and storage folders from the untracked files only', async () => {
			const paths = await getContextFilePaths(tmpPath);

			expect(paths).toContain(join('node_modules', 'tracked', 'index.js'));
			expect(paths).not.toContain(join('node_modules', 'untracked', 'index.js'));
			expect(paths).not.toContain(join('storage', 'key_value_stores', 'default', 'INPUT.json'));
		});

		it('does not apply .actorignore, as the platform clone has none of its effects', async () => {
			const paths = await getContextFilePaths(tmpPath);

			// Tracked, so in the clone, although .actorignore excludes it.
			expect(paths).toContain(join(ACTOR_PATH, 'src', 'index.ts'));
			// Git-ignored, so not in the clone, whatever .actorignore force-includes.
			expect(paths).not.toContain(join(ACTOR_PATH, 'dist', 'main.js'));
		});

		it('keeps a symlink, as a Git clone does', async () => {
			expect(await getContextFilePaths(tmpPath)).toContain(join(ACTOR_PATH, 'shared'));
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
	});
});
