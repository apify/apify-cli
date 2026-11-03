import { execSync } from 'node:child_process';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import process from 'node:process';

import { findActorDirs, toPosixRelative } from '../../../src/lib/find-actor-dirs.js';
import { getActorLocalFilePaths, getGitignoreMatcher } from '../../../src/lib/utils.js';
import { useIsolatedGit } from '../../__setup__/hooks/useIsolatedGit.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';

// vi.mock is hoisted before imports, so the gitignore matcher gets the mocked version. With `gitAvailable` off, every
// git call fails as it does without git, which sends the matcher to its own .gitignore parsing. `failing` fails only
// the commands it returns true for. `commands` records every command.
const gitState = vi.hoisted(() => ({
	gitAvailable: true,
	failing: undefined as ((command: string) => boolean) | undefined,
	commands: [] as string[],
}));
vi.mock('node:child_process', async (importOriginal) => {
	const original = await importOriginal<typeof import('node:child_process')>();
	return {
		...original,
		execSync: ((...args: Parameters<typeof original.execSync>) => {
			const command = String(args[0]);
			gitState.commands.push(command);
			if (!gitState.gitAvailable || gitState.failing?.(command)) {
				throw new Error('not a git repository');
			}
			return original.execSync(...args);
		}) as typeof original.execSync,
	};
});

useIsolatedGit('find-actor-dirs-git-home');

const { beforeAllCalls, afterAllCalls, joinPath, tmpPath } = useTempPath('find-actor-dirs', {
	create: true,
	remove: true,
	cwd: false,
	cwdParent: false,
});

async function write(relativePath: string, content = '') {
	await mkdir(dirname(joinPath(relativePath)), { recursive: true });
	await writeFile(joinPath(relativePath), content);
}

async function writeActor(dir: string, name: string | undefined = dir.split('/').pop()) {
	await write(`${dir}/.actor/actor.json`, JSON.stringify({ actorSpecification: 1, name }));
}

beforeEach(async () => {
	gitState.gitAvailable = true;
	gitState.failing = undefined;
	await beforeAllCalls();
	// Its own repository, so the .gitignore and .git/info/exclude of the apify-cli checkout don't apply.
	execSync('git init', { cwd: tmpPath, stdio: 'ignore' });
	gitState.commands = [];
});

afterEach(async () => {
	await afterAllCalls();
});

describe('findActorDirs', () => {
	it('returns the Actor directories below the root sorted by path, with their names', async () => {
		await writeActor('actors/zeta');
		await writeActor('actors/alpha');
		await writeActor('tools/beta', 'tool-beta');
		await write('packages/shared/index.js');

		await expect(findActorDirs(tmpPath)).resolves.toEqual([
			{ dir: 'actors/alpha', name: 'alpha', ignored: false },
			{ dir: 'actors/zeta', name: 'zeta', ignored: false },
			{ dir: 'tools/beta', name: 'tool-beta', ignored: false },
		]);
	});

	it('skips the directories apify push always ignores', async () => {
		await writeActor('actors/alpha');
		await writeActor('node_modules/dep');
		await writeActor('.git/hooks');
		await writeActor('apify_storage/x');
		await writeActor('storage/x');
		await writeActor('crawlee_storage/x');
		await writeActor('packages/node_modules/nested');

		const dirs = (await findActorDirs(tmpPath)).map((actor) => actor.dir);

		expect(dirs).toEqual(['actors/alpha']);
	});

	it('does not descend below a found Actor', async () => {
		await writeActor('actors/alpha');
		await writeActor('actors/alpha/vendored/inner');

		const dirs = (await findActorDirs(tmpPath)).map((actor) => actor.dir);

		expect(dirs).toEqual(['actors/alpha']);
	});

	it('reports an unreadable or nameless actor.json without a name', async () => {
		await write('broken/.actor/actor.json', '{ not json');
		await write('nameless/.actor/actor.json', '{}');

		await expect(findActorDirs(tmpPath)).resolves.toEqual([
			{ dir: 'broken', name: undefined, ignored: false },
			{ dir: 'nameless', name: undefined, ignored: false },
		]);
	});

	it('returns an empty list when nothing below the root is an Actor', async () => {
		await write('packages/shared/index.js');
		await write('README.md');

		await expect(findActorDirs(tmpPath)).resolves.toEqual([]);
	});

	// chmod 000 has no effect on Windows and root reads the directory anyway.
	const canMakeUnreadable = process.platform !== 'win32' && process.getuid?.() !== 0;

	it.skipIf(!canMakeUnreadable)('skips a directory it cannot read and keeps the rest', async () => {
		await writeActor('actors/alpha');
		await mkdir(joinPath('locked', 'inner'), { recursive: true });
		await chmod(joinPath('locked'), 0o000);

		try {
			const dirs = (await findActorDirs(tmpPath)).map((actor) => actor.dir);

			expect(dirs).toEqual(['actors/alpha']);
		} finally {
			await chmod(joinPath('locked'), 0o755);
		}
	});

	it('returns an empty list for a root that does not exist', async () => {
		await expect(findActorDirs(join(tmpPath, 'missing'))).resolves.toEqual([]);
	});

	it('uses / as the separator, also on Windows', async () => {
		await writeActor('group/sub/actor');

		const [found] = await findActorDirs(tmpPath);

		expect(found.dir).toBe('group/sub/actor');
		expect(found.dir).not.toContain('\\');
		expect(toPosixRelative(tmpPath, joinPath('group', 'sub', 'actor'))).toBe('group/sub/actor');
	});

	describe('Actors in directories .gitignore ignores', () => {
		// The root .gitignore ignores a parent directory, and a nested .gitignore ignores an Actor directory itself.
		// .git/info/exclude ignores actors/delta, which only git reads. An Actor's own .gitignore, as every template
		// ships, and an ignored file inside an Actor leave the Actor alone. The root .gitignore also ignores legacy,
		// which holds a tracked file, so git lists its other files one by one.
		async function writeRepository() {
			await write('.git/info/exclude', 'actors/delta/\n');
			await write('.gitignore', 'archive/\nlegacy/\n*.log\n');
			await writeActor('legacy');
			await write('legacy/main.js');
			execSync('git add -f legacy/main.js', { cwd: tmpPath, stdio: 'ignore' });
			await write('actors/.gitignore', 'gamma\n');
			await writeActor('actors/beta');
			await write('actors/beta/.gitignore', 'node_modules\nstorage\n');
			await write('actors/beta/debug.log');
			await writeActor('actors/delta');
			await writeActor('actors/gamma');
			await writeActor('archive/old/alpha');
		}

		const expected = ({ deltaIgnored }: { deltaIgnored: boolean }) => [
			{ dir: 'actors/beta', name: 'beta', ignored: false },
			{ dir: 'actors/delta', name: 'delta', ignored: deltaIgnored },
			{ dir: 'actors/gamma', name: 'gamma', ignored: true },
			{ dir: 'archive/old/alpha', name: 'alpha', ignored: true },
			{ dir: 'legacy', name: 'legacy', ignored: true },
		];

		it('asks git and marks them ignored, as the upload leaves them out', async () => {
			await writeRepository();

			await expect(findActorDirs(tmpPath)).resolves.toEqual(expected({ deltaIgnored: true }));

			const uploaded = await getActorLocalFilePaths(tmpPath);
			expect(uploaded).toContain('actors/beta/.actor/actor.json');
			expect(uploaded).not.toContain('actors/delta/.actor/actor.json');
			expect(uploaded).not.toContain('actors/gamma/.actor/actor.json');
			expect(uploaded).not.toContain('archive/old/alpha/.actor/actor.json');
			expect(uploaded).not.toContain('legacy/.actor/actor.json');
		});

		it('reads the .gitignore files itself when git is unavailable', async () => {
			await writeRepository();
			gitState.gitAvailable = false;

			await expect(findActorDirs(tmpPath)).resolves.toEqual(expected({ deltaIgnored: false }));
		});

		// In the next two, the Actor directory holds a tracked file, so git lists its other files one by one and is
		// asked about the directory itself.
		it('asks git about an ignored Actor with a non-ASCII name that holds a tracked file', async () => {
			// git's default, set here in case a config turns it off. Without -z, git prints such names quoted and
			// escaped.
			execSync('git config core.quotePath true', { cwd: tmpPath, stdio: 'ignore' });
			await write('.gitignore', 'old/\n');
			await writeActor('old/příliš');
			await write('old/příliš/main.js');
			execSync('git add -f old', { cwd: tmpPath, stdio: 'ignore' });

			await expect(findActorDirs(tmpPath)).resolves.toEqual([{ dir: 'old/příliš', name: 'příliš', ignored: true }]);
		});

		it('asks git about an ignored Actor whose name is stored decomposed', async () => {
			// Decomposed, as macOS archives and older macOS volumes store names. Git prints the name back as it was
			// asked.
			const name = 'čaj'.normalize('NFD');
			await write('.gitignore', 'old/\n');
			await writeActor(`old/${name}`);
			await write(`old/${name}/main.js`);
			execSync('git add -f old', { cwd: tmpPath, stdio: 'ignore' });

			const found = await findActorDirs(tmpPath);

			expect(found.map((actor) => ({ ...actor, dir: actor.dir.normalize('NFC') }))).toEqual([
				{ dir: 'old/čaj', name, ignored: true },
			]);
		});

		it('judges from a root that .gitignore ignores, even when it holds a tracked file', async () => {
			// Discovery from group/ drops the line that ignores group/ itself, as the upload does, and keeps the rest.
			await write('.gitignore', 'group/\n');
			await write('group/.gitignore', 'old/\n');
			await write('group/README.md');
			execSync('git add -f group/README.md', { cwd: tmpPath, stdio: 'ignore' });
			await writeActor('group/actors/alpha');
			await writeActor('group/old/beta');

			await expect(findActorDirs(joinPath('group'))).resolves.toEqual([
				{ dir: 'actors/alpha', name: 'alpha', ignored: false },
				{ dir: 'old/beta', name: 'beta', ignored: true },
			]);
		});
	});
});

describe('getGitignoreMatcher, which discovery shares with the upload', () => {
	it('asks git about directories only when the caller names some', async () => {
		await writeActor('actors/alpha');
		const stdinCommands = () => gitState.commands.filter((command) => command.includes('--stdin'));

		await getActorLocalFilePaths(tmpPath);
		expect(stdinCommands()).toEqual([]);

		await findActorDirs(tmpPath);
		expect(stdinCommands()).toHaveLength(1);
	});

	it('reads the rules itself when git lists ./ from a directory .gitignore ignores', async () => {
		// The check whether the rules ignore the directory fails, so git is asked for its listing, which is only `./`.
		await write('.gitignore', 'ghost/\n*.log\n');
		await write('ghost/.gitignore', 'secret.env\n');
		await write('ghost/main.js');
		await write('ghost/secret.env');
		await write('ghost/x.log');
		gitState.failing = (command) => command.includes('check-ignore') && command.endsWith(' ./');

		const isGitignored = await getGitignoreMatcher(joinPath('ghost'));

		expect(gitState.commands.some((command) => command.includes('ls-files'))).toBe(true);
		expect(isGitignored('main.js')).toBe(false);
		expect(isGitignored('secret.env')).toBe(true);
		expect(isGitignored('x.log')).toBe(true);
	});
});
