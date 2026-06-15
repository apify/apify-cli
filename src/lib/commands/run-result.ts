import process from 'node:process';

import type { ActorRun, ApifyClient } from 'apify-client';
import chalk from 'chalk';

import { ACTOR_JOB_STATUSES } from '@apify/consts';

import { CommandExitCodes } from '../consts.js';
import { simpleLog } from '../outputs.js';
import { printJsonToStdout } from '../utils.js';

/** Which command produced the run, used for labels and the JSON `operation` field. */
export type RunResultOperation = 'call' | 'task-run';

const OPERATION_LABELS: Record<RunResultOperation, string> = {
	'call': 'Apify call',
	'task-run': 'Apify task run',
};

/** How many trailing log lines to surface as the failure reason. */
const LOG_TAIL_LINES = 10;

const CONSOLE_BASE_URL = 'https://console.apify.com';

function actorUrl(actorId: string) {
	return `${CONSOLE_BASE_URL}/actors/${actorId}`;
}

export function runUrl(actorId: string, runId: string) {
	return `${CONSOLE_BASE_URL}/actors/${actorId}/runs/${runId}`;
}

function datasetUrl(datasetId: string) {
	return `${CONSOLE_BASE_URL}/storage/datasets/${datasetId}`;
}

function isSucceeded(run: ActorRun): boolean {
	return run.status === ACTOR_JOB_STATUSES.SUCCEEDED;
}

/**
 * Maps a terminal run status to the process exit code the CLI should report so that
 * callers (CI, shell chains, agents) can tell a started run from a successful one.
 * Failed runs propagate the Actor's own exit code when present (mirroring `apify run`).
 */
export function getRunExitCode(run: ActorRun): number {
	switch (run.status) {
		case ACTOR_JOB_STATUSES.SUCCEEDED:
			return 0;
		case ACTOR_JOB_STATUSES.ABORTED:
		case ACTOR_JOB_STATUSES.ABORTING:
			return CommandExitCodes.RunAborted;
		case ACTOR_JOB_STATUSES.TIMED_OUT:
		case ACTOR_JOB_STATUSES.TIMING_OUT:
			return CommandExitCodes.RunTimedOut;
		default:
			return run.exitCode && run.exitCode !== 0 ? run.exitCode : CommandExitCodes.RunFailed;
	}
}

/** A generic, status-specific reason used when the platform did not provide a status message. */
function genericReason(run: ActorRun): string {
	switch (run.status) {
		case ACTOR_JOB_STATUSES.ABORTED:
		case ACTOR_JOB_STATUSES.ABORTING:
			return 'Actor run was aborted';
		case ACTOR_JOB_STATUSES.TIMED_OUT:
		case ACTOR_JOB_STATUSES.TIMING_OUT:
			return 'Actor run timed out';
		default:
			return 'Actor run failed';
	}
}

/**
 * Fetches the last few log lines of a finished run to explain a failure. Returns an empty
 * array on success or when the log cannot be retrieved (best-effort, never throws).
 */
export async function fetchRunLogTail(apifyClient: ApifyClient, run: ActorRun): Promise<string[]> {
	if (isSucceeded(run)) {
		return [];
	}

	let log: string | undefined;

	try {
		log = await apifyClient.log(run.id).get();
	} catch {
		return [];
	}

	if (!log) {
		return [];
	}

	return log
		.split('\n')
		.map((line) => line.trimEnd())
		.filter((line) => line.length > 0)
		.slice(-LOG_TAIL_LINES);
}

export interface RunResultOptions {
	run: ActorRun;
	operation: RunResultOperation;
	logTail: string[];
}

/** Builds the structured `--json` payload so agents can reliably branch on the final status. */
export function buildRunResultJson({ run, operation, logTail }: RunResultOptions) {
	const ok = isSucceeded(run);

	return {
		ok,
		operation,
		actor: {
			id: run.actId,
			url: actorUrl(run.actId),
		},
		run: {
			id: run.id,
			status: run.status,
			exitCode: run.exitCode ?? null,
			url: runUrl(run.actId, run.id),
		},
		storage: {
			defaultDatasetId: run.defaultDatasetId,
			defaultKeyValueStoreId: run.defaultKeyValueStoreId,
			datasetUrl: datasetUrl(run.defaultDatasetId),
		},
		error: ok
			? null
			: {
					phase: 'run',
					message: run.statusMessage || genericReason(run),
					logTail,
				},
		exitCode: getRunExitCode(run),
	};
}

/** Prints the human-readable final result summary to stdout. */
export function printRunResultSummary({ run, operation, logTail }: RunResultOptions) {
	const ok = isSucceeded(run);
	const statusColor = ok ? chalk.green : chalk.red;

	const message: string[] = [
		`${OPERATION_LABELS[operation]} result: ${statusColor(run.status)}`,
		'',
		`${chalk.yellow('Run')}: ${statusColor(run.status)}`,
		`${chalk.yellow('Actor ID')}: ${run.actId}`,
		`${chalk.yellow('Run ID')}: ${run.id}`,
		`${chalk.yellow('Build number')}: ${run.buildNumber}`,
	];

	if (!ok && run.exitCode != null) {
		message.push(`${chalk.yellow('Exit code')}: ${run.exitCode}`);
	}

	message.push(
		`${chalk.yellow('Dataset ID')}: ${run.defaultDatasetId}`,
		`${chalk.yellow('Key-value store ID')}: ${run.defaultKeyValueStoreId}`,
		'',
		`${chalk.blue('Run URL')}: ${runUrl(run.actId, run.id)}`,
		`${chalk.blue('Dataset URL')}: ${datasetUrl(run.defaultDatasetId)}`,
	);

	if (!ok) {
		message.push('', `${chalk.yellow('Reason')}:`, run.statusMessage || genericReason(run), ...logTail);
	}

	simpleLog({ message: message.join('\n'), stdout: true });
}

export interface FinalizeRunOptions {
	apifyClient: ApifyClient;
	run: ActorRun;
	operation: RunResultOperation;
	json: boolean;
	silent?: boolean;
}

/**
 * Sets the process exit code from the run's final status and prints the outcome — either the
 * structured `--json` payload or the human-readable summary. Every caller that waits for a run
 * to finish should funnel through this so the final-status contract stays consistent.
 */
export async function finalizeRun({ apifyClient, run, operation, json, silent }: FinalizeRunOptions) {
	process.exitCode = getRunExitCode(run);

	if (json) {
		const logTail = await fetchRunLogTail(apifyClient, run);
		printJsonToStdout(buildRunResultJson({ run, operation, logTail }));
		return;
	}

	if (!silent) {
		const logTail = await fetchRunLogTail(apifyClient, run);
		printRunResultSummary({ run, operation, logTail });
	}
}
