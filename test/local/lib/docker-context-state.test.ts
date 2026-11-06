import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

import { readGitState } from '../../../src/lib/docker-context.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';

// vi.mock is hoisted before imports, so the reader gets the mocked version. With `gitAvailable` off, every git
// call fails as it does without git.
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

describe('readGitState', () => {
	const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath('docker-context-state-test-dir', {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	const git = (...args: string[]) =>
		execFileSync('git', args, { cwd: tmpPath, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

	beforeAll(async () => {
		await beforeAllCalls();
		writeFileSync(joinPath('README.md'), 'content');
		git('init', '--quiet', '--initial-branch=main');
		git('add', '.');
		git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '-m', 'init');
	});

	afterAll(async () => {
		gitState.gitAvailable = true;
		await afterAllCalls();
	});

	it('reads the commit and the branch of a clean checkout with no remote', () => {
		expect(readGitState(tmpPath)).toEqual({ commit: git('rev-parse', 'HEAD'), branch: 'main', dirty: false });
	});

	it('strips credentials from the origin URL and leaves an scp-like one alone', () => {
		git('remote', 'add', 'origin', 'https://user:token@github.com/apify/actor-monorepo-example.git');
		expect(readGitState(tmpPath).remoteUrl).toBe('https://github.com/apify/actor-monorepo-example.git');

		git('remote', 'set-url', 'origin', 'git@github.com:apify/actor-monorepo-example.git');
		expect(readGitState(tmpPath).remoteUrl).toBe('git@github.com:apify/actor-monorepo-example.git');
	});

	it('flags an untracked file as dirty', () => {
		writeFileSync(joinPath('notes.txt'), 'content');
		expect(readGitState(tmpPath).dirty).toBe(true);
	});

	it('reports no branch on a detached HEAD', () => {
		git('checkout', '--quiet', '--detach');
		expect(readGitState(tmpPath)).not.toHaveProperty('branch');
		expect(readGitState(tmpPath).commit).toBe(git('rev-parse', 'HEAD'));
	});

	it('reads nothing without git', () => {
		gitState.gitAvailable = false;
		expect(readGitState(tmpPath)).toEqual({});
	});
});
