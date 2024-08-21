import process from 'node:process';

import { ACTOR_JOB_STATUSES } from '@apify/consts';
import { Flags } from '@oclif/core';
import type { ActorRun, ApifyClient, TaskStartOptions } from 'apify-client';

import { resolveInput } from './resolve-input.js';
import { CommandExitCodes } from '../consts.js';
import { error, link, run as runLog, success, warning } from '../outputs.js';
import { outputJobLog } from '../utils.js';

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
}

export async function runActorOrTaskOnCloud(apifyClient: ApifyClient, options: RunOnCloudOptions) {
	const cwd = process.cwd();
	const { actorOrTaskData, runOptions, type, waitForFinishMillis, inputOverride, silent } = options;

	const clientMethod = type === 'Actor' ? 'actor' : 'task';

	// Get input for actor
	const actorInput = resolveInput(cwd, inputOverride);

	if (!silent) {
		if (type === 'Actor') {
			runLog({ message: `Calling ${type} ${actorOrTaskData.userFriendlyId} (${actorOrTaskData.id})` });
		} else if (actorOrTaskData.title) {
			runLog({
				message: `Calling ${type} ${actorOrTaskData.title} (${actorOrTaskData.userFriendlyId}, ${actorOrTaskData.id})`,
			});
		} else {
			runLog({ message: `Calling ${type} ${actorOrTaskData.userFriendlyId} (${actorOrTaskData.id})` });
		}
	}

	let run: ActorRun;

	try {
		if (actorInput && type === 'Actor') {
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
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} catch (err: any) {
		// TODO: Better error message in apify-client-js
		if (err.type === 'record-not-found')
			throw new Error(`${type} ${actorOrTaskData.userFriendlyId} (${actorOrTaskData.id}) not found!`);
		else throw err;
	}

	if (!silent) {
		try {
			await outputJobLog(run, waitForFinishMillis);
		} catch (err) {
			warning({ message: 'Can not get log:' });
			console.error(err);
		}
	}

	run = (await apifyClient.run(run.id).get())!;

	if (!silent) {
		link({ message: `${type} run detail`, url: `https://console.apify.com/actors/${run.actId}#/runs/${run.id}` });

		if (run.status === ACTOR_JOB_STATUSES.SUCCEEDED) {
			success({ message: `${type} finished.` });
		} else if (run.status === ACTOR_JOB_STATUSES.RUNNING) {
			warning({ message: `${type} is still running!` });
		} else if (run.status === ACTOR_JOB_STATUSES.ABORTED || run.status === ACTOR_JOB_STATUSES.ABORTING) {
			warning({ message: `${type} was aborted!` });
			process.exitCode = CommandExitCodes.RunAborted;
		} else {
			error({ message: `${type} failed!` });
			process.exitCode = CommandExitCodes.RunFailed;
		}
	}

	return run;
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
	'wait-for-finish': Flags.string({
		char: 'w',
		description: 'Seconds for waiting to run to finish, if no value passed, it waits forever.',
		required: false,
	}),
});
