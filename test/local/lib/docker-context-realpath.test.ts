import { execFileSync } from 'node:child_process';
import { mkdirSync, type PathLike, realpathSync, writeFileSync } from 'node:fs';

import { checkActorPaths } from '../../../src/lib/actor-paths.js';
import { resolveDockerContext } from '../../../src/lib/docker-context.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';

// vi.mock is hoisted before imports, so the resolver and the path check get the mocked version. With `nativeFails` on,
// the native realpath fails for every path, as on Windows RAM and virtual disks, while the JS one still works.
const fsState = vi.hoisted(() => ({ nativeFails: false }));
vi.mock('node:fs', async (importOriginal) => {
	const original = await importOriginal<typeof import('node:fs')>();
	const native = (path: PathLike) => {
		if (fsState.nativeFails) {
			throw Object.assign(new Error('EISDIR: illegal operation on a directory, realpath'), { code: 'EISDIR' });
		}
		return original.realpathSync.native(path);
	};
	return { ...original, realpathSync: Object.assign((path: PathLike) => original.realpathSync(path), { native }) };
});

const ACTOR_PATH = 'actors/x';

describe('where the native realpath call fails', () => {
	const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath('docker-context-realpath-test-dir', {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	let root: string;

	beforeAll(async () => {
		await beforeAllCalls();
		mkdirSync(joinPath(ACTOR_PATH, '.actor'), { recursive: true });
		writeFileSync(joinPath(ACTOR_PATH, '.actor', 'actor.json'), '{}');
		writeFileSync(joinPath(ACTOR_PATH, 'Dockerfile'), 'FROM apify/actor-node:20\n');
		execFileSync('git', ['init', '--quiet'], { cwd: tmpPath, stdio: 'ignore' });
		root = realpathSync(tmpPath);
		fsState.nativeFails = true;
	});

	afterAll(async () => {
		fsState.nativeFails = false;
		await afterAllCalls();
	});

	it('resolves a monorepo Actor with the JS implementation', () => {
		expect(resolveDockerContext(joinPath(ACTOR_PATH), '../../..')).toEqual({
			kind: 'outside',
			contextRoot: root,
			sourceRoot: root,
			actorPath: ACTOR_PATH,
		});
	});

	it('checks the paths of an ordinary Actor with the JS implementation', () => {
		const actorDir = joinPath(ACTOR_PATH);
		expect(
			checkActorPaths({
				actorDir,
				uploadRoot: actorDir,
				uploadedFiles: ['.actor/actor.json', 'Dockerfile'],
				config: { dockerfile: '../Dockerfile' },
			}),
		).toEqual([]);
	});
});
