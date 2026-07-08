import type { ActorRun, ApifyClient, Build } from 'apify-client';
import chalk from 'chalk';

import { ACTOR_JOB_STATUSES, ACTOR_JOB_TERMINAL_STATUSES, ACTOR_JOB_TYPES } from '@apify/consts';

import { CommandExitCodes } from '../consts.js';

export type TerminalStatus = (typeof ACTOR_JOB_TERMINAL_STATUSES)[number];

export type JobStatus = (typeof ACTOR_JOB_STATUSES)[keyof typeof ACTOR_JOB_STATUSES];

export type JobType = (typeof ACTOR_JOB_TYPES)[keyof typeof ACTOR_JOB_TYPES];

export function isTerminalStatus(status: JobStatus | undefined): status is TerminalStatus {
	return !!status && (ACTOR_JOB_TERMINAL_STATUSES as readonly string[]).includes(status);
}

export function exitCodeForJobStatus(status: JobStatus | undefined, kind: JobType): number {
	switch (status) {
		case ACTOR_JOB_STATUSES.SUCCEEDED:
			return 0;
		case ACTOR_JOB_STATUSES.TIMED_OUT:
		case ACTOR_JOB_STATUSES.TIMING_OUT:
			return kind === ACTOR_JOB_TYPES.BUILD ? CommandExitCodes.BuildTimedOut : CommandExitCodes.RunTimedOut;
		case ACTOR_JOB_STATUSES.ABORTED:
		case ACTOR_JOB_STATUSES.ABORTING:
			return kind === ACTOR_JOB_TYPES.BUILD ? CommandExitCodes.BuildAborted : CommandExitCodes.RunAborted;
		default:
			return kind === ACTOR_JOB_TYPES.BUILD ? CommandExitCodes.BuildFailed : CommandExitCodes.RunFailed;
	}
}

export function exitCodeForWaitResult(result: WaitForJobResult, kind: JobType): number {
	// A client-side wait give-up is not a platform timeout, so report it with a distinct exit
	// code rather than mislabelling the still-running job as having timed out on the platform.
	return result.timedOutWaiting ? CommandExitCodes.WaitTimedOut : exitCodeForJobStatus(result.job.status, kind);
}

export interface WaitForJobOptions {
	apifyClient: ApifyClient;
	jobId: string;
	kind: JobType;
	/** Poll interval in milliseconds. Defaults to 2000. */
	pollIntervalMillis?: number;
	/** Maximum time to wait before giving up. Defaults to no limit. */
	maxWaitMillis?: number;
}

export interface WaitForJobResult {
	job: Build | ActorRun;
	/**
	 * True when the wait gave up because `maxWaitMillis` elapsed before the job reached a terminal
	 * status. In that case `job.status` is the real, still-non-terminal platform status (e.g. RUNNING) —
	 * the client gave up waiting, the job itself did not time out.
	 */
	timedOutWaiting: boolean;
}

export async function waitForTerminalStatus(options: WaitForJobOptions): Promise<WaitForJobResult> {
	const { apifyClient, jobId, kind, pollIntervalMillis = 2000, maxWaitMillis } = options;
	const startedAt = Date.now();

	while (true) {
		const job =
			kind === ACTOR_JOB_TYPES.BUILD ? await apifyClient.build(jobId).get() : await apifyClient.run(jobId).get();

		if (!job) {
			throw new Error(`${kind === ACTOR_JOB_TYPES.BUILD ? 'Build' : 'Run'} with ID "${jobId}" was not found.`);
		}

		if (isTerminalStatus(job.status)) {
			return { job, timedOutWaiting: false };
		}

		if (maxWaitMillis && Date.now() - startedAt >= maxWaitMillis) {
			return { job, timedOutWaiting: true };
		}

		const sleepMillis = maxWaitMillis
			? Math.min(pollIntervalMillis, maxWaitMillis - (Date.now() - startedAt))
			: pollIntervalMillis;
		await new Promise((resolve) => setTimeout(resolve, Math.max(0, sleepMillis)));
	}
}

export async function fetchLogTail(apifyClient: ApifyClient, jobId: string, maxLines = 20): Promise<string[]> {
	try {
		const log = await apifyClient.log(jobId).get();
		if (!log) return [];

		const lines = log
			.split('\n')
			.map((line) => line.trimEnd())
			.filter((line) => line.length > 0);
		return lines.slice(-maxLines);
	} catch {
		return [];
	}
}

export function consoleRunUrl(actorId: string, runId: string): string {
	return `https://console.apify.com/actors/${actorId}/runs/${runId}`;
}

export function consoleBuildUrl(actorId: string, buildNumber: string): string {
	return `https://console.apify.com/actors/${actorId}#/builds/${buildNumber}`;
}

export function consoleDatasetUrl(datasetId: string): string {
	return `https://console.apify.com/storage/datasets/${datasetId}`;
}

function statusColor(status: JobStatus): string {
	if (status === ACTOR_JOB_STATUSES.SUCCEEDED) return chalk.green(status);
	if (status === ACTOR_JOB_STATUSES.RUNNING || status === ACTOR_JOB_STATUSES.READY) return chalk.blue(status);
	return chalk.red(status);
}

export interface ResultSummaryOptions {
	resultLabel: string; // e.g. "Apify push result"
	overallStatus: 'SUCCEEDED' | 'FAILED' | 'ABORTED' | 'TIMED-OUT' | 'RUNNING';
	lines: { label: string; value: string }[];
	links?: { label: string; url: string }[];
	errorReason?: string[];
}

export function formatResultSummary(options: ResultSummaryOptions): string {
	const out: string[] = [];
	out.push(`${chalk.bold(options.resultLabel)}: ${statusColor(options.overallStatus)}`);
	out.push('');

	for (const line of options.lines) {
		out.push(`${line.label}: ${line.value}`);
	}

	if (options.links?.length) {
		out.push('');
		for (const link of options.links) {
			out.push(`${link.label}: ${chalk.blue(link.url)}`);
		}
	}

	if (options.errorReason?.length) {
		out.push('');
		out.push(chalk.red('Reason:'));
		for (const line of options.errorReason) {
			out.push(line);
		}
	}

	return out.join('\n');
}
