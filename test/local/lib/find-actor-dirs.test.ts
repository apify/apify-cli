import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import process from 'node:process';

import { findActorDirs, toPosixRelative } from '../../../src/lib/find-actor-dirs.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';

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
	await beforeAllCalls();
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
			{ dir: 'actors/alpha', name: 'alpha' },
			{ dir: 'actors/zeta', name: 'zeta' },
			{ dir: 'tools/beta', name: 'tool-beta' },
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
			{ dir: 'broken', name: undefined },
			{ dir: 'nameless', name: undefined },
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
});
