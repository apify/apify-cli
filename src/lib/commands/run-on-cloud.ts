import process from 'node:process';

import type { ActorRun, ActorStartOptions, ApifyClient, TaskStartOptions } from 'apify-client';
import chalk from 'chalk';

import { ACTOR_JOB_STATUSES } from '@apify/consts';

import { Flags } from '../command-framework/flags.js';
import { CommandExitCodes } from '../consts.js';
import { useAbortJobOnSignal } from '../hooks/useAbortJobOnSignal.js';
import { error, run as runLog, success, warning } from '../outputs.js';
import { outputJobLog } from '../utils.js';
import { resolveInput } from './resolve-input.js';

const TerminalStatuses = [
	ACTOR_JOB_STATUSES.SUCCEEDED,
	ACTOR_JOB_STATUSES.ABORTED,
	ACTOR_JOB_STATUSES.FAILED,
	ACTOR_JOB_STATUSES.TIMED_OUT,
];

export interface RunOnCloudOptions {
	actorOrTaskData: {
		id: string;
		userFriendlyId: string;
		title?: string;
	};
	runOptions: TaskStartOptions;
	type: 'Actor' | 'Task';
	waitForFinishMillis?: number;
	inputOverride?: Record<string, unknown>;
	silent?: boolean;
	waitForRunToFinish?: boolean;
	printRunLogs?: boolean;
	/**
	 * When true, suppresses the final "Actor finished/failed" status line and the
	 * implicit `process.exitCode` write at the end of the generator. Use this when
	 * the caller renders its own final result summary and owns the exit code.
	 */
	suppressFinalStatus?: boolean;
	/**
	 * Extra query parameters for the run-start request that the Apify API itself does not know - local
	 * Actor runtime extensions such as `devFolder=false`. apify-client's `start()` rejects unknown
	 * options, so a run with these is started through a raw request instead. Actors only.
	 */
	extraStartParams?: Record<string, string>;
}

/**
 * `POST .../actors/:actorId/runs` by hand, with `extraStartParams` alongside the standard run options,
 * then re-read through the client so the result has the exact shape `start()` would have returned.
 */
async function startActorWithExtraParams(
	apifyClient: ApifyClient,
	actorId: string,
	input: { inputToUse: unknown; contentType: string } | null,
	runOptions: ActorStartOptions,
	extraStartParams: Record<string, string>,
): Promise<ActorRun> {
	const { waitForFinish, timeout, memory, build } = runOptions;

	const response = await apifyClient.httpClient.call<{ data: { id: string } }>({
		url: `${apifyClient.actor(actorId).url}/runs`,
		method: 'POST',
		data: input?.inputToUse,
		headers: input ? { 'content-type': input.contentType } : undefined,
		params: { waitForFinish, timeout, memory, build, ...extraStartParams },
	});

	return (await apifyClient.run(response.data.data.id).get())!;
}

export async function* runActorOrTaskOnCloud(apifyClient: ApifyClient, options: RunOnCloudOptions) {
	const cwd = process.cwd();
	const {
		actorOrTaskData,
		runOptions,
		type,
		waitForFinishMillis,
		inputOverride,
		silent,
		waitForRunToFinish,
		printRunLogs,
		suppressFinalStatus,
		extraStartParams,
	} = options;

	const clientMethod = type === 'Actor' ? 'actor' : 'task';

	// Get input for actor
	const actorInput = resolveInput(cwd, inputOverride);

	if (!silent) {
		if (type === 'Actor') {
			runLog({
				message: `Calling ${type} ${actorOrTaskData.userFriendlyId} (${chalk.gray(actorOrTaskData.id)})\n`,
			});
		} else if (actorOrTaskData.title) {
			runLog({
				message: `Calling ${type} ${actorOrTaskData.title} (${actorOrTaskData.userFriendlyId}, ${chalk.gray(actorOrTaskData.id)})\n`,
			});
		} else {
			runLog({
				message: `Calling ${type} ${actorOrTaskData.userFriendlyId} (${chalk.gray(actorOrTaskData.id)})\n`,
			});
		}
	}

	let run: ActorRun;

	try {
		if (extraStartParams && type === 'Actor') {
			run = await startActorWithExtraParams(apifyClient, actorOrTaskData.id, actorInput, runOptions, extraStartParams);
		} else if (actorInput && type === 'Actor') {
			// TODO: For some reason we cannot pass json as buffer with right contentType into apify-client.
			// It will save malformed JSON which looks like buffer as INPUT.
			// We need to fix this in v1 during removing call under Actor namespace.
			run = await apifyClient[clientMethod](actorOrTaskData.id).start(actorInput.inputToUse, {
				...runOptions,
				contentType: actorInput.contentType,
			});
		} else {
			run = await apifyClient[clientMethod](actorOrTaskData.id).start(undefined, runOptions);
		}
	} catch (err: any) {
		// TODO: Better error message in apify-client-js
		if (err.type === 'record-not-found') {
			// The API's own message says what exactly is missing - e.g. a local runtime reports an Actor that
			// exists but has no build under the requested tag with this same error type.
			const reason = typeof err.message === 'string' && err.message ? `: ${err.message}` : '!';
			throw new Error(`${type} ${actorOrTaskData.userFriendlyId} (${actorOrTaskData.id}) not found${reason}`);
		}

		if (err.type === 'full-permission-actor-not-approved') {
			const approvalUrl: string | undefined = err.data?.approvalUrl;
			const lines = [
				`${type} ${actorOrTaskData.userFriendlyId} requires full access to your Apify account and has not been approved yet.`,
			];
			if (approvalUrl) {
				lines.push('', `Approve here: ${chalk.blue(approvalUrl)}`);
			}
			throw new Error(lines.join('\n'));
		}

		throw err;
	}

	// From this point on the run exists on the platform. Forward interrupt
	// signals to a platform-side abort so the run does not keep burning
	// compute units after the user gives up waiting locally (Ctrl+C, SIGTERM
	// from a parent process, SIGHUP from a closing terminal). The `using`
	// binding removes the listener when this generator finishes or is
	// terminated by the consumer (e.g. `break` out of `for await`).
	using _signalHandler = useAbortJobOnSignal({
		apifyClient,
		kind: 'run',
		jobId: run.id,
		runType: type,
		silent,
	});

	// Return the started run right away
	yield run;

	if (!silent && printRunLogs) {
		try {
			const res = await outputJobLog({ job: run, timeoutMillis: waitForFinishMillis, apifyClient });

			if (res === 'timeouts') {
				console.error(`\n${chalk.gray('Timeout for printing logs was hit, there may be future logs.')}\n`);
			} else {
				console.error();
			}
		} catch (err) {
			warning({ message: 'Can not get log:' });
			console.error(err);
		}
	}

	run = (await apifyClient.run(run.id).get())!;

	if (waitForRunToFinish) {
		while (!TerminalStatuses.includes(run.status as never)) {
			run = (await apifyClient.run(run.id).get())!;

			if (TerminalStatuses.includes(run.status as never)) {
				break;
			}

			// Wait a second before checking again
			await new Promise((resolve) => {
				setTimeout(resolve, 1000);
			});
		}
	}

	if (!suppressFinalStatus) {
		if (run.status === ACTOR_JOB_STATUSES.SUCCEEDED) {
			if (!silent) success({ message: `${type} finished.` });
		} else if (run.status === ACTOR_JOB_STATUSES.RUNNING) {
			if (!silent) warning({ message: `${type} is still running!` });
		} else if (run.status === ACTOR_JOB_STATUSES.ABORTED || run.status === ACTOR_JOB_STATUSES.ABORTING) {
			if (!silent) warning({ message: `${type} was aborted!` });
			process.exitCode = CommandExitCodes.RunAborted;
		} else {
			if (!silent) error({ message: `${type} failed!` });
			process.exitCode = CommandExitCodes.RunFailed;
		}
	}

	// Return the finished run
	yield run;
}

export const SharedRunOnCloudFlags = (type: 'Actor' | 'Task') => ({
	build: Flags.string({
		char: 'b',
		description: 'Tag or number of the build to run (e.g. "latest" or "1.2.34").',
		required: false,
	}),
	timeout: Flags.integer({
		char: 't',
		description: `Timeout for the ${type} run in seconds. Zero value means there is no timeout.`,
		required: false,
	}),
	memory: Flags.integer({
		char: 'm',
		description: `Amount of memory allocated for the ${type} run, in megabytes.`,
		required: false,
	}),
});
