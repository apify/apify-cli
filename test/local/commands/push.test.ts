import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ACTOR_JOB_STATUSES } from '@apify/consts';

import { detectOmitDevTscTrap, resolvePushOutcome } from '../../../src/commands/actors/push.js';
import { CommandExitCodes } from '../../../src/lib/consts.js';

describe('resolvePushOutcome', () => {
	test.each([
		[ACTOR_JOB_STATUSES.SUCCEEDED, { resultLabel: 'SUCCEEDED', exitCode: 0, ok: true }],
		[ACTOR_JOB_STATUSES.READY, { resultLabel: 'PENDING', ok: true }],
		[ACTOR_JOB_STATUSES.RUNNING, { resultLabel: 'RUNNING', ok: true }],
		[ACTOR_JOB_STATUSES.ABORTING, { resultLabel: 'ABORTING', exitCode: CommandExitCodes.BuildAborted, ok: false }],
		[ACTOR_JOB_STATUSES.ABORTED, { resultLabel: 'ABORTED', exitCode: CommandExitCodes.BuildAborted, ok: false }],
		[ACTOR_JOB_STATUSES.TIMING_OUT, { resultLabel: 'TIMING_OUT', exitCode: CommandExitCodes.BuildTimedOut, ok: false }],
		[ACTOR_JOB_STATUSES.TIMED_OUT, { resultLabel: 'TIMED_OUT', exitCode: CommandExitCodes.BuildTimedOut, ok: false }],
		[ACTOR_JOB_STATUSES.FAILED, { resultLabel: 'FAILED', exitCode: CommandExitCodes.BuildFailed, ok: false }],
		['SOME_UNKNOWN_STATUS', { resultLabel: 'UNKNOWN', exitCode: CommandExitCodes.BuildFailed, ok: false }],
	])('maps build status %s to the expected outcome', (status, expected) => {
		expect(resolvePushOutcome(status)).toMatchObject(expected);
	});

	test('in-progress builds carry no exit code yet, terminal ones do', () => {
		expect(resolvePushOutcome(ACTOR_JOB_STATUSES.READY).exitCode).toBeUndefined();
		expect(resolvePushOutcome(ACTOR_JOB_STATUSES.RUNNING).exitCode).toBeUndefined();
		expect(resolvePushOutcome(ACTOR_JOB_STATUSES.SUCCEEDED).exitCode).toBe(0);
		expect(resolvePushOutcome(ACTOR_JOB_STATUSES.ABORTING).exitCode).toBe(CommandExitCodes.BuildAborted);
		expect(resolvePushOutcome(ACTOR_JOB_STATUSES.FAILED).exitCode).toBe(CommandExitCodes.BuildFailed);
	});

	test('failing outcomes carry an error message, successful ones do not', () => {
		expect(resolvePushOutcome(ACTOR_JOB_STATUSES.SUCCEEDED).errorMessage).toBeUndefined();
		expect(resolvePushOutcome(ACTOR_JOB_STATUSES.READY).errorMessage).toBeUndefined();
		expect(resolvePushOutcome(ACTOR_JOB_STATUSES.RUNNING).errorMessage).toBeUndefined();
		expect(resolvePushOutcome(ACTOR_JOB_STATUSES.ABORTING).errorMessage).toBe('Build is aborting');
		expect(resolvePushOutcome(ACTOR_JOB_STATUSES.ABORTED).errorMessage).toBe('Build aborted');
		expect(resolvePushOutcome(ACTOR_JOB_STATUSES.TIMING_OUT).errorMessage).toBe('Build is timing out');
		expect(resolvePushOutcome(ACTOR_JOB_STATUSES.TIMED_OUT).errorMessage).toBe('Build timed out');
		expect(resolvePushOutcome(ACTOR_JOB_STATUSES.FAILED).errorMessage).toBe('Build failed');
	});
});

describe('detectOmitDevTscTrap', () => {
	function makeProject(files: Record<string, string>): string {
		const root = mkdtempSync(join(tmpdir(), 'apify-cli-push-trap-'));
		for (const [rel, content] of Object.entries(files)) {
			const abs = join(root, rel);
			mkdirSync(join(abs, '..'), { recursive: true });
			writeFileSync(abs, content);
		}
		return root;
	}

	test('warns when Dockerfile omits dev deps and build uses tsc with typescript only in devDependencies', () => {
		const root = makeProject({
			Dockerfile: 'FROM node:20\nRUN npm install --omit=dev\nCMD ["node", "dist/main.js"]\n',
			'package.json': JSON.stringify({
				scripts: { build: 'tsc' },
				devDependencies: { typescript: '^5.0.0' },
			}),
		});
		expect(detectOmitDevTscTrap(root)).toMatch(/npm --omit=dev/);
	});

	test('warns for .actor/Dockerfile as well', () => {
		const root = makeProject({
			'.actor/Dockerfile': 'FROM node:20\nRUN npm ci --omit=dev\n',
			'package.json': JSON.stringify({
				scripts: { build: 'tsc -p tsconfig.build.json' },
				devDependencies: { typescript: '^5.0.0' },
			}),
		});
		expect(detectOmitDevTscTrap(root)).not.toBeNull();
	});

	test('also recognizes --production as dev-drop flag', () => {
		const root = makeProject({
			Dockerfile: 'FROM node:20\nRUN npm install --production\n',
			'package.json': JSON.stringify({
				scripts: { build: 'tsc' },
				devDependencies: { typescript: '^5.0.0' },
			}),
		});
		expect(detectOmitDevTscTrap(root)).not.toBeNull();
	});

	test('does not warn when typescript is also in dependencies (already available at build time)', () => {
		const root = makeProject({
			Dockerfile: 'FROM node:20\nRUN npm install --omit=dev\n',
			'package.json': JSON.stringify({
				scripts: { build: 'tsc' },
				dependencies: { typescript: '^5.0.0' },
				devDependencies: { typescript: '^5.0.0' },
			}),
		});
		expect(detectOmitDevTscTrap(root)).toBeNull();
	});

	test('does not warn when Dockerfile does not drop dev deps', () => {
		const root = makeProject({
			Dockerfile: 'FROM node:20\nRUN npm install\n',
			'package.json': JSON.stringify({
				scripts: { build: 'tsc' },
				devDependencies: { typescript: '^5.0.0' },
			}),
		});
		expect(detectOmitDevTscTrap(root)).toBeNull();
	});

	test('does not warn when build script does not use tsc', () => {
		const root = makeProject({
			Dockerfile: 'FROM node:20\nRUN npm install --omit=dev\n',
			'package.json': JSON.stringify({
				scripts: { build: 'tsdown' },
				devDependencies: { typescript: '^5.0.0' },
			}),
		});
		expect(detectOmitDevTscTrap(root)).toBeNull();
	});

	test('does not confuse tsc-alias / tsconfig-paths for a tsc invocation', () => {
		const root = makeProject({
			Dockerfile: 'FROM node:20\nRUN npm install --omit=dev\n',
			'package.json': JSON.stringify({
				scripts: { build: 'tsc-alias' },
				devDependencies: { typescript: '^5.0.0' },
			}),
		});
		expect(detectOmitDevTscTrap(root)).toBeNull();
	});

	test('returns null when there is no Dockerfile', () => {
		const root = makeProject({
			'package.json': JSON.stringify({
				scripts: { build: 'tsc' },
				devDependencies: { typescript: '^5.0.0' },
			}),
		});
		expect(detectOmitDevTscTrap(root)).toBeNull();
	});

	test('returns null when package.json is missing or malformed', () => {
		const root = makeProject({
			Dockerfile: 'FROM node:20\nRUN npm install --omit=dev\n',
			'package.json': '{ this is not valid json',
		});
		expect(detectOmitDevTscTrap(root)).toBeNull();
	});
});
