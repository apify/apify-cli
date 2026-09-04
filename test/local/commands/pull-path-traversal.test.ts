/**
 * Regression tests for issue #1191 — path traversal in `apify actors pull` via API-supplied filenames.
 *
 * Exercises the actual production command through the same code path used by the original
 * reproduction (SOURCE_FILES branch → mkdirSync/writeFileSync). No real API token required.
 */

import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import * as path from 'node:path';
import process from 'node:process';

import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';

const TRAVERSAL_MARKER = 'APIFY_PATH_TRAVERSAL_1191';
const ACTOR_NAME = 'traversal-test-actor';
const ACTOR_ID = 'traversal-actor-id';

// currentMaliciousFilename is the second file in the fake actor's sourceFiles array.
// Tests set this before calling testRunCommand.
let currentMaliciousFilename = '../../outside.txt';
let currentMaliciousContent = TRAVERSAL_MARKER;

vitest.mock('../../../src/lib/utils.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../../src/lib/utils.js')>()),
	getLocalUserInfo: vitest.fn(async () => ({ id: 'testUserId', username: 'testUser' })),
	getLoggedClientOrThrow: vitest.fn(async () => ({
		actor: (_id: string) => ({
			get: async () => ({
				id: ACTOR_ID,
				name: ACTOR_NAME,
				versions: [
					{
						versionNumber: '0.1',
						sourceType: 'SOURCE_FILES',
						buildTag: 'latest',
						sourceFiles: [
							{ name: 'main.js', format: 'TEXT', content: '// legitimate\n', folder: false },
							{ name: currentMaliciousFilename, format: 'TEXT', content: currentMaliciousContent, folder: false },
						],
					},
				],
			}),
		}),
	})),
}));

// process.cwd() → <repo>/test/tmp/pull-traversal/
// actor lands at → <repo>/test/tmp/pull-traversal/traversal-test-actor/
const TEMP_LABEL = 'pull-traversal';
const { tmpPath, beforeAllCalls, afterAllCalls } = useTempPath(TEMP_LABEL, {
	create: true,
	remove: true,
	cwd: true,
	cwdParent: false,
});

useConsoleSpy();

const actorDir = () => join(tmpPath, ACTOR_NAME);

const { ActorsPullCommand } = await import('../../../src/commands/actors/pull.js');

describe('path traversal in actors pull (issue #1191)', () => {
	beforeAll(beforeAllCalls);
	afterAll(afterAllCalls);

	let savedExitCode: typeof process.exitCode;

	beforeEach(() => {
		savedExitCode = process.exitCode;
		process.exitCode = undefined;
		currentMaliciousContent = TRAVERSAL_MARKER;
	});

	afterEach(async () => {
		process.exitCode = savedExitCode;
		await rm(actorDir(), { recursive: true, force: true });
	});

	// ── 1. Math proof: string concat + relative segments escapes actorDir ────────
	it('string concat resolves outside actorDir (math proof)', () => {
		const root = resolve(actorDir());
		const destination = resolve(actorDir() + '/' + '../../outside.txt');

		expect(destination.startsWith(root + '/')).toBe(false);
		expect(destination).not.toContain(ACTOR_NAME);
	});

	// ── 2. BLOCKED: ../../outside.txt ────────────────────────────────────────────
	it('BLOCKED: ../../outside.txt is rejected; no file written outside actor directory', async () => {
		currentMaliciousFilename = '../../outside.txt';
		const escapedPath = resolve(actorDir() + '/' + currentMaliciousFilename);
		await rm(escapedPath, { force: true });

		await testRunCommand(ActorsPullCommand, { args_actorId: ACTOR_ID });

		expect(process.exitCode).toBeTruthy();
		expect(existsSync(escapedPath)).toBe(false);
	});

	// ── 3. BLOCKED: ../sibling.txt ────────────────────────────────────────────────
	it('BLOCKED: ../sibling.txt is rejected; no file written outside actor directory', async () => {
		currentMaliciousFilename = '../sibling.txt';
		const escapedPath = resolve(actorDir() + '/' + currentMaliciousFilename);
		await rm(escapedPath, { force: true });

		await testRunCommand(ActorsPullCommand, { args_actorId: ACTOR_ID });

		expect(process.exitCode).toBeTruthy();
		expect(existsSync(escapedPath)).toBe(false);
	});

	// ── 4. BLOCKED: deeply nested traversal ──────────────────────────────────────
	it('BLOCKED: foo/../../../deep-escape.txt is rejected; no file written outside actor directory', async () => {
		currentMaliciousFilename = 'foo/../../../deep-escape.txt';
		const escapedPath = resolve(actorDir() + '/' + currentMaliciousFilename);
		await rm(escapedPath, { force: true });

		await testRunCommand(ActorsPullCommand, { args_actorId: ACTOR_ID });

		expect(process.exitCode).toBeTruthy();
		expect(existsSync(escapedPath)).toBe(false);
	});

	// ── 5. BLOCKED: absolute path ─────────────────────────────────────────────────
	it('BLOCKED: /tmp/apify-traversal-1191.txt (absolute POSIX path) is rejected', async () => {
		currentMaliciousFilename = '/tmp/apify-traversal-1191.txt';
		await rm(currentMaliciousFilename, { force: true });

		await testRunCommand(ActorsPullCommand, { args_actorId: ACTOR_ID });

		expect(process.exitCode).toBeTruthy();
		expect(existsSync(currentMaliciousFilename)).toBe(false);
	});

	// ── 6. SAFE: src/nested/safe.js stays inside actorDir ────────────────────────
	it('SAFE: src/nested/safe.js is written inside the actor directory', async () => {
		currentMaliciousFilename = 'src/nested/safe.js';

		await testRunCommand(ActorsPullCommand, { args_actorId: ACTOR_ID });

		expect(process.exitCode).toBeFalsy();
		expect(existsSync(join(actorDir(), 'src/nested/safe.js'))).toBe(true);
	});

	// ── 7. SAFE: ..foo.js — starts with ".." but is NOT a traversal ──────────────
	it('SAFE: ..foo.js (not a traversal) is written inside the actor directory', async () => {
		currentMaliciousFilename = '..foo.js';

		await testRunCommand(ActorsPullCommand, { args_actorId: ACTOR_ID });

		expect(process.exitCode).toBeFalsy();
		expect(existsSync(join(actorDir(), '..foo.js'))).toBe(true);
	});

	// ── 8. SAFE: .actor/actor.json (special branch) ──────────────────────────────
	it('SAFE: .actor/actor.json is written inside the actor directory', async () => {
		currentMaliciousFilename = '.actor/actor.json';
		currentMaliciousContent = '{ "actorSpecification": 1, "name": "old-name", "version": "0.1" }';

		await testRunCommand(ActorsPullCommand, { args_actorId: ACTOR_ID });

		expect(process.exitCode).toBeFalsy();
		expect(existsSync(join(actorDir(), '.actor/actor.json'))).toBe(true);
	});

	// ── 9. SAFE: deep/nested/folder/index.ts ─────────────────────────────────────
	it('SAFE: deep/nested/folder/index.ts is written inside the actor directory', async () => {
		currentMaliciousFilename = 'deep/nested/folder/index.ts';

		await testRunCommand(ActorsPullCommand, { args_actorId: ACTOR_ID });

		expect(process.exitCode).toBeFalsy();
		expect(existsSync(join(actorDir(), 'deep/nested/folder/index.ts'))).toBe(true);
	});
});

// ── Windows different-drive semantics (path.win32, deterministic on any OS) ──
//
// On Windows, path.relative('C:\\root', 'D:\\other\\file') returns the
// destination path unchanged ('D:\\other\\file') because cross-drive relative
// paths cannot be expressed. That result is absolute, so the previous check
// (rel === '..' || rel.startsWith('..\\')) would have missed it.
// The isAbsolute(rel) guard closes this bypass.
describe('containment predicate — Windows different-drive bypass (path.win32)', () => {
	it('BLOCKED: D:\\outside\\x.txt on C:\\ root — relative() returns absolute; isAbsolute catches it', () => {
		const { isAbsolute: winIsAbsolute, relative: winRelative, resolve: winResolve, sep: winSep } = path.win32;

		const root = winResolve('C:\\repo\\actor');
		const dest = winResolve(root, 'D:\\outside\\x.txt');
		const rel = winRelative(root, dest);

		// On a different drive, relative() returns an absolute path on Windows
		expect(winIsAbsolute(rel)).toBe(true);

		// Confirm the full containment predicate rejects it
		const isUnsafe = rel === '..' || rel.startsWith(`..${winSep}`) || winIsAbsolute(rel);
		expect(isUnsafe).toBe(true);
	});

	it('SAFE: C:\\repo\\actor\\src\\main.js on same root — relative() is a normal relative path', () => {
		const { isAbsolute: winIsAbsolute, relative: winRelative, resolve: winResolve, sep: winSep } = path.win32;

		const root = winResolve('C:\\repo\\actor');
		const dest = winResolve(root, 'src\\main.js');
		const rel = winRelative(root, dest);

		expect(winIsAbsolute(rel)).toBe(false);

		const isUnsafe = rel === '..' || rel.startsWith(`..${winSep}`) || winIsAbsolute(rel);
		expect(isUnsafe).toBe(false);
	});
});
