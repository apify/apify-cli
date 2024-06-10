import process from 'node:process';

import { ACTOR_JOB_STATUSES } from '@apify/consts';
import { Flags } from '@oclif/core';
import { ActorRun, ApifyClient, TaskStartOptions } from 'apify-client';
import mime from 'mime';

import { CommandExitCodes } from '../consts.js';
import { error, link, run as runLog, success, warning } from '../outputs.js';
import { getLocalInput, outputJobLog } from '../utils.js';

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
}

export async function runActorOrTaskOnCloud(apifyClient: ApifyClient, options: RunOnCloudOptions) {
    const cwd = process.cwd();
    const {
        actorOrTaskData,
        runOptions,
        type,
        waitForFinishMillis,
        inputOverride,
    } = options;

    const clientMethod = type === 'Actor' ? 'actor' : 'task';

    // Get input for act
    const localInput = getLocalInput(cwd);

    if (type === 'Actor') {
        runLog(`Calling ${type} ${actorOrTaskData.userFriendlyId} (${actorOrTaskData.id})`);
    } else if (actorOrTaskData.title) {
        runLog(`Calling ${type} ${actorOrTaskData.title} (${actorOrTaskData.userFriendlyId}, ${actorOrTaskData.id})`);
    } else {
        runLog(`Calling ${type} ${actorOrTaskData.userFriendlyId} (${actorOrTaskData.id})`);
    }

    let run: ActorRun;

    try {
        if ((localInput || inputOverride) && type === 'Actor') {
            let inputToUse: Record<string, unknown> | undefined;
            let contentType: string;

            if (inputOverride) {
                inputToUse = inputOverride;
                contentType = 'application/json';
            } else if (localInput) {
                const ext = mime.getExtension(localInput.contentType!);

                if (ext === 'json') {
                    inputToUse = JSON.parse(localInput.body.toString('utf8'));
                    contentType = 'application/json';
                } else {
                    inputToUse = localInput.body as never;
                    contentType = localInput.contentType!;
                }
            } else {
                throw new Error('Unreachable');
            }

            // TODO: For some reason we cannot pass json as buffer with right contentType into apify-client.
            // It will save malformed JSON which looks like buffer as INPUT.
            // We need to fix this in v1 during removing call under Actor namespace.
            run = await apifyClient[clientMethod](actorOrTaskData.id).start(inputToUse, { ...runOptions, contentType });
        } else {
            run = await apifyClient[clientMethod](actorOrTaskData.id).start(undefined, runOptions);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        // TODO: Better error message in apify-client-js
        if (err.type === 'record-not-found') throw new Error(`${type} ${actorOrTaskData.userFriendlyId} (${actorOrTaskData.id}) not found!`);
        else throw err;
    }

    try {
        await outputJobLog(run, waitForFinishMillis);
    } catch (err) {
        warning('Can not get log:');
        console.error(err);
    }

    run = (await apifyClient.run(run.id).get())!;

    link(`${type} run detail`, `https://console.apify.com/actors/${run.actId}#/runs/${run.id}`);

    if (run.status === ACTOR_JOB_STATUSES.SUCCEEDED) {
        success(`${type} finished.`);
    } else if (run.status === ACTOR_JOB_STATUSES.RUNNING) {
        warning(`${type} is still running!`);
    } else if (run.status === ACTOR_JOB_STATUSES.ABORTED || run.status === ACTOR_JOB_STATUSES.ABORTING) {
        warning(`${type} was aborted!`);
        process.exitCode = CommandExitCodes.RunAborted;
    } else {
        error(`${type} failed!`);
        process.exitCode = CommandExitCodes.RunFailed;
    }
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
