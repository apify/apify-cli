import type { ActorRun, ApifyClient, Build } from 'apify-client';
import chalk from 'chalk';

import { ACTOR_JOB_TERMINAL_STATUSES } from '@apify/consts';

import { CommandExitCodes } from '../consts.js';

export type TerminalStatus = 'SUCCEEDED' | 'FAILED' | 'ABORTED' | 'TIMED-OUT';

const TERMINAL_STATUSES = new Set<string>(ACTOR_JOB_TERMINAL_STATUSES as readonly string[]);

export function isTerminalStatus(status: string | undefined): status is TerminalStatus {
	return !!status && TERMINAL_STATUSES.has(status);
}

export function exitCodeForJobStatus(status: string | undefined, kind: 'build' | 'run'): number {
	switch (status) {
		case 'SUCCEEDED':
			return 0;
		case 'TIMED-OUT':
		case 'TIMING-OUT':
			return kind === 'build' ? CommandExitCodes.BuildTimedOut : CommandExitCodes.RunTimedOut;
		case 'ABORTED':
		case 'ABORTING':
			return kind === 'build' ? CommandExitCodes.BuildAborted : CommandExitCodes.RunAborted;
		default:
			return kind === 'build' ? CommandExitCodes.BuildFailed : CommandExitCodes.RunFailed;
	}
}

export interface WaitForJobOptions {
	apifyClient: ApifyClient;
	jobId: string;
	kind: 'build' | 'run';
	/** Poll interval in milliseconds. Defaults to 2000. */
	pollIntervalMillis?: number;
	/** Maximum time to wait before giving up. Defaults to no limit. */
	maxWaitMillis?: number;
}

export async function waitForTerminalStatus(options: WaitForJobOptions): Promise<Build | ActorRun> {
	const { apifyClient, jobId, kind, pollIntervalMillis = 2000, maxWaitMillis } = options;
	const startedAt = Date.now();

	while (true) {
		const job =
			kind === 'build'
				? ((await apifyClient.build(jobId).get()) as Build | undefined)
				: ((await apifyClient.run(jobId).get()) as ActorRun | undefined);

		if (!job) {
			throw new Error(`${kind === 'build' ? 'Build' : 'Run'} with ID "${jobId}" was not found.`);
		}

		if (isTerminalStatus(job.status)) {
			return job;
		}

		if (maxWaitMillis && Date.now() - startedAt >= maxWaitMillis) {
			return { ...job, status: 'TIMED-OUT' } as typeof job;
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

		const lines = log.split('\n').filter((line) => line.length > 0);
		return lines.slice(-maxLines);
	} catch {
		return [];
	}
}

export function consoleActorUrl(actorId: string): string {
	return `https://console.apify.com/actors/${actorId}`;
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

export function consoleKeyValueStoreUrl(storeId: string): string {
	return `https://console.apify.com/storage/key-value-stores/${storeId}`;
}

function statusColor(status: string): string {
	if (status === 'SUCCEEDED') return chalk.green(status);
	if (status === 'RUNNING' || status === 'READY') return chalk.blue(status);
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
