import { ACTOR_JOB_STATUSES } from '@apify/consts';

import { resolvePushOutcome } from '../../../src/commands/actors/push.js';
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
