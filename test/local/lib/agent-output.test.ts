import type { ActorRun, ApifyClient, Build } from 'apify-client';

import { ACTOR_JOB_TYPES } from '@apify/consts';

import {
	exitCodeForJobStatus,
	exitCodeForWaitResult,
	isTerminalStatus,
	waitForTerminalStatus,
} from '../../../src/lib/commands/agent-output.js';
import { CommandExitCodes } from '../../../src/lib/consts.js';

const makeBuild = (status: Build['status']): Build => ({ id: 'build123', status }) as Build;
const makeRun = (status: ActorRun['status']): ActorRun => ({ id: 'run123', status }) as ActorRun;

const fakeClient = ({ builds = [], runs = [] }: { builds?: (Build | undefined)[]; runs?: (ActorRun | undefined)[] }) =>
	({
		build: () => ({ get: async () => builds.shift() }),
		run: () => ({ get: async () => runs.shift() }),
	}) as unknown as ApifyClient;

describe('isTerminalStatus', () => {
	it.each(['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'] as const)('returns true for %s', (status) => {
		expect(isTerminalStatus(status)).toBe(true);
	});

	it.each(['READY', 'RUNNING', 'TIMING-OUT', 'ABORTING', undefined] as const)('returns false for %s', (status) => {
		expect(isTerminalStatus(status)).toBe(false);
	});
});

describe('exitCodeForJobStatus', () => {
	it.each([
		['SUCCEEDED', 0, 0],
		['TIMED-OUT', CommandExitCodes.BuildTimedOut, CommandExitCodes.RunTimedOut],
		['TIMING-OUT', CommandExitCodes.BuildTimedOut, CommandExitCodes.RunTimedOut],
		['ABORTED', CommandExitCodes.BuildAborted, CommandExitCodes.RunAborted],
		['ABORTING', CommandExitCodes.BuildAborted, CommandExitCodes.RunAborted],
		['FAILED', CommandExitCodes.BuildFailed, CommandExitCodes.RunFailed],
		['RUNNING', CommandExitCodes.BuildFailed, CommandExitCodes.RunFailed],
	] as const)('maps %s to build=%i run=%i', (status, buildCode, runCode) => {
		expect(exitCodeForJobStatus(status, ACTOR_JOB_TYPES.BUILD)).toBe(buildCode);
		expect(exitCodeForJobStatus(status, ACTOR_JOB_TYPES.RUN)).toBe(runCode);
	});
});

describe('exitCodeForWaitResult', () => {
	it('returns WaitTimedOut when the client gave up waiting', () => {
		const result = { job: makeRun('RUNNING'), timedOutWaiting: true };
		expect(exitCodeForWaitResult(result, ACTOR_JOB_TYPES.RUN)).toBe(CommandExitCodes.WaitTimedOut);
	});

	it('falls back to the job status exit code otherwise', () => {
		const result = { job: makeBuild('SUCCEEDED'), timedOutWaiting: false };
		expect(exitCodeForWaitResult(result, ACTOR_JOB_TYPES.BUILD)).toBe(0);
	});
});

describe('waitForTerminalStatus', () => {
	it('returns immediately when the job is already terminal', async () => {
		const apifyClient = fakeClient({ builds: [makeBuild('SUCCEEDED')] });

		const result = await waitForTerminalStatus({ apifyClient, jobId: 'build123', kind: ACTOR_JOB_TYPES.BUILD });

		expect(result).toEqual({ job: makeBuild('SUCCEEDED'), timedOutWaiting: false });
	});

	it('polls until the job reaches a terminal status', async () => {
		const apifyClient = fakeClient({ runs: [makeRun('RUNNING'), makeRun('RUNNING'), makeRun('SUCCEEDED')] });

		const result = await waitForTerminalStatus({
			apifyClient,
			jobId: 'run123',
			kind: ACTOR_JOB_TYPES.RUN,
			pollIntervalMillis: 1,
		});

		expect(result).toEqual({ job: makeRun('SUCCEEDED'), timedOutWaiting: false });
	});

	it('gives up with timedOutWaiting when maxWaitMillis elapses first', async () => {
		const apifyClient = fakeClient({ runs: Array.from({ length: 100 }, () => makeRun('RUNNING')) });

		const result = await waitForTerminalStatus({
			apifyClient,
			jobId: 'run123',
			kind: ACTOR_JOB_TYPES.RUN,
			pollIntervalMillis: 1,
			maxWaitMillis: 20,
		});

		expect(result).toEqual({ job: makeRun('RUNNING'), timedOutWaiting: true });
	});

	it('throws when the job does not exist', async () => {
		const apifyClient = fakeClient({ builds: [undefined] });

		await expect(waitForTerminalStatus({ apifyClient, jobId: 'missing', kind: ACTOR_JOB_TYPES.BUILD })).rejects.toThrow(
			'Build with ID "missing" was not found.',
		);
	});
});
