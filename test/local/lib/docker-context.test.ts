import { execFileSync } from 'node:child_process';
import { mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { resolveDockerContext } from '../../../src/lib/docker-context.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';

// vi.mock is hoisted before imports, so the resolver gets the mocked version. With `gitAvailable` off, every git
// call fails as it does without git, which sends the resolver down its non-Git branch.
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

describe('resolveDockerContext', () => {
	describe('inside a Git repository', () => {
		const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath('docker-context-test-dir', {
			create: true,
			remove: true,
			cwd: false,
			cwdParent: false,
		});

		// The resolver works from real paths, so the expectations do too.
		let root: string;
		const actorDir = () => joinPath(ACTOR_PATH);

		beforeAll(async () => {
			await beforeAllCalls();
			mkdirSync(joinPath(ACTOR_PATH, '.actor'), { recursive: true });
			mkdirSync(joinPath(ACTOR_PATH, 'src'), { recursive: true });
			mkdirSync(joinPath('shared'), { recursive: true });
			writeFileSync(joinPath('Dockerfile'), 'FROM apify/actor-node:20\n');
			symlinkSync(ACTOR_PATH, joinPath('linked-actor'));
			execFileSync('git', ['init', '--quiet'], { cwd: tmpPath, stdio: 'ignore' });
			root = realpathSync(tmpPath);
		});

		afterAll(async () => {
			await afterAllCalls();
		});

		it('treats a missing field, or a context at or below the Actor folder, as an ordinary push', () => {
			expect(resolveDockerContext(actorDir(), undefined)).toEqual({ kind: 'none' });
			expect(resolveDockerContext(actorDir(), '')).toEqual({ kind: 'none' });
			expect(resolveDockerContext(actorDir(), '..')).toEqual({ kind: 'none' });
			expect(resolveDockerContext(actorDir(), '.')).toEqual({ kind: 'none' });
			expect(resolveDockerContext(actorDir(), '../src')).toEqual({ kind: 'none' });
		});

		it('resolves a context above the Actor folder to the repository root and the Actor path in it', () => {
			expect(resolveDockerContext(actorDir(), '../../..')).toEqual({
				kind: 'context',
				contextRoot: root,
				sourceRoot: root,
				actorPath: ACTOR_PATH,
			});
		});

		it('keeps the repository root as the source for a context elsewhere in the repository', () => {
			expect(resolveDockerContext(actorDir(), '../../../shared')).toEqual({
				kind: 'context',
				contextRoot: join(root, 'shared'),
				sourceRoot: root,
				actorPath: ACTOR_PATH,
			});
		});

		it('resolves a symlinked Actor folder from its real path, as the platform does', () => {
			expect(resolveDockerContext(joinPath('linked-actor'), '../../..')).toEqual({
				kind: 'context',
				contextRoot: root,
				sourceRoot: root,
				actorPath: ACTOR_PATH,
			});
		});

		it('rejects a context outside the Git repository', () => {
			expect(resolveDockerContext(actorDir(), '../../../..')).toEqual({
				kind: 'invalid',
				message:
					`"dockerContextDir" in .actor/actor.json points to ${dirname(root)}, outside the Git repository ${root}. ` +
					'The Apify platform builds from a clone of the repository, so it could not build this Actor.',
			});
		});

		it('rejects a context that does not exist', () => {
			expect(resolveDockerContext(actorDir(), '../../../missing')).toEqual({
				kind: 'invalid',
				message: `"dockerContextDir" in .actor/actor.json points to ${join(root, 'missing')}, which does not exist.`,
			});
		});

		it('rejects a context that is not a directory', () => {
			expect(resolveDockerContext(actorDir(), '../../../Dockerfile')).toEqual({
				kind: 'invalid',
				message: `"dockerContextDir" in .actor/actor.json points to ${join(root, 'Dockerfile')}, which is not a directory.`,
			});
		});

		it('rejects an Actor folder that does not exist', () => {
			expect(resolveDockerContext(joinPath('missing-actor'), '../../..')).toEqual({
				kind: 'invalid',
				message: `The Actor folder ${joinPath('missing-actor')} does not exist.`,
			});
		});

		it('rejects a field that is not a string', () => {
			expect(resolveDockerContext(actorDir(), 42)).toEqual({
				kind: 'invalid',
				message: '"dockerContextDir" in .actor/actor.json must be a string.',
			});
		});
	});

	describe('outside a Git repository', () => {
		const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath('docker-context-no-git-dir', {
			create: true,
			remove: true,
			cwd: false,
			cwdParent: false,
		});

		let root: string;
		const actorDir = () => joinPath(ACTOR_PATH);

		beforeAll(async () => {
			await beforeAllCalls();
			mkdirSync(joinPath(ACTOR_PATH, '.actor'), { recursive: true });
			mkdirSync(joinPath('other'), { recursive: true });
			root = realpathSync(tmpPath);
			gitState.gitAvailable = false;
		});

		afterAll(async () => {
			gitState.gitAvailable = true;
			await afterAllCalls();
		});

		it('makes the context the source when it contains the Actor folder', () => {
			expect(resolveDockerContext(actorDir(), '../../..')).toEqual({
				kind: 'context',
				contextRoot: root,
				sourceRoot: root,
				actorPath: ACTOR_PATH,
			});
		});

		it('rejects a sibling directory, which does not contain the Actor folder', () => {
			expect(resolveDockerContext(actorDir(), '../../../other')).toEqual({
				kind: 'invalid',
				message: `"dockerContextDir" in .actor/actor.json points to ${join(root, 'other')}, which does not contain the Actor's folder.`,
			});
		});

		it('rejects a context that does not exist', () => {
			expect(resolveDockerContext(actorDir(), '../../../missing')).toEqual({
				kind: 'invalid',
				message: `"dockerContextDir" in .actor/actor.json points to ${join(root, 'missing')}, which does not exist.`,
			});
		});
	});
});
