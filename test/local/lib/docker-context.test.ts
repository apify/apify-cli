import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { resolveDockerContext } from '../../../src/lib/docker-context.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';

const ACTOR_PATH = 'actors/x';

describe('resolveDockerContext', () => {
	describe('inside a Git repository', () => {
		const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath('docker-context-test-dir', {
			create: true,
			remove: true,
			cwd: false,
			cwdParent: false,
		});

		const actorDir = () => joinPath(ACTOR_PATH);

		beforeAll(async () => {
			await beforeAllCalls();
			mkdirSync(joinPath(ACTOR_PATH, '.actor'), { recursive: true });
			mkdirSync(joinPath(ACTOR_PATH, 'src'), { recursive: true });
			mkdirSync(joinPath('shared'), { recursive: true });
			execFileSync('git', ['init', '--quiet'], { cwd: tmpPath, stdio: 'ignore' });
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
				contextRoot: tmpPath,
				sourceRoot: realpathSync(tmpPath),
				actorPath: ACTOR_PATH,
			});
		});

		it('keeps the repository root as the source for a context elsewhere in the repository', () => {
			expect(resolveDockerContext(actorDir(), '../../../shared')).toEqual({
				kind: 'context',
				contextRoot: joinPath('shared'),
				sourceRoot: realpathSync(tmpPath),
				actorPath: ACTOR_PATH,
			});
		});

		it('rejects a context outside the Git repository', () => {
			const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
				cwd: actorDir(),
				encoding: 'utf-8',
			}).trim();

			expect(resolveDockerContext(actorDir(), '../../../..')).toEqual({
				kind: 'invalid',
				message:
					`"dockerContextDir" in .actor/actor.json points to ${resolve(tmpPath, '..')}, outside the Git repository ${repoRoot}. ` +
					'The Apify platform builds from a clone of the repository, so it could not build this Actor.',
			});
		});

		it('rejects a context that does not exist', () => {
			expect(resolveDockerContext(actorDir(), '../../../missing')).toEqual({
				kind: 'invalid',
				message: `"dockerContextDir" in .actor/actor.json points to ${joinPath('missing')}, which does not exist.`,
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
		let root: string;
		let actorDir: string;

		beforeAll(() => {
			root = mkdtempSync(join(tmpdir(), 'apify-cli-docker-context-'));
			actorDir = join(root, ACTOR_PATH);
			mkdirSync(join(actorDir, '.actor'), { recursive: true });
			mkdirSync(join(root, 'other'), { recursive: true });
		});

		afterAll(() => {
			rmSync(root, { recursive: true, force: true });
		});

		it('makes the context the source when it contains the Actor folder', () => {
			expect(resolveDockerContext(actorDir, '../../..')).toEqual({
				kind: 'context',
				contextRoot: root,
				sourceRoot: root,
				actorPath: ACTOR_PATH,
			});
		});

		it('rejects a sibling directory, which does not contain the Actor folder', () => {
			expect(resolveDockerContext(actorDir, '../../../other')).toEqual({
				kind: 'invalid',
				message: `"dockerContextDir" in .actor/actor.json points to ${join(root, 'other')}, which does not contain the Actor's folder.`,
			});
		});

		it('rejects a context that does not exist', () => {
			// `resolve`, not `join`: on Windows the resolved context carries the drive (`D:\repo`), as the command resolves it.
			const repoDir = resolve('/repo');

			expect(resolveDockerContext(join(repoDir, 'actors', 'a'), '../../..')).toEqual({
				kind: 'invalid',
				message: `"dockerContextDir" in .actor/actor.json points to ${repoDir}, which does not exist.`,
			});
		});
	});
});
