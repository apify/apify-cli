// TODO: Show full error messages and HTTP codes, this is not great:
// jan:testx$ apify call help
// Run: Calling act help...
// Error: [record-not-found]

import process from 'node:process';

import { ACTOR_JOB_STATUSES } from '@apify/consts';
import { Args, Flags } from '@oclif/core';
import { ActorRun, ActorStartOptions, ApifyClient } from 'apify-client';
import mime from 'mime';

import { ApifyCommand } from '../lib/apify_command.js';
import { CommandExitCodes, LOCAL_CONFIG_PATH } from '../lib/consts.js';
import { error, link, run as runLog, success, warning } from '../lib/outputs.js';
import { getLocalConfig, getLocalInput, getLocalUserInfo, getLoggedClientOrThrow, outputJobLog } from '../lib/utils.js';

export class CallCommand extends ApifyCommand<typeof CallCommand> {
    static override description = 'Runs a specific Actor remotely on the Apify cloud platform.\n'
    + 'The Actor is run under your current Apify account. Therefore you need to be logged in by calling "apify login". '
    + 'It takes input for the Actor from the default local key-value store by default.';

    static override flags = {
        build: Flags.string({
            char: 'b',
            description: 'Tag or number of the build to run (e.g. "latest" or "1.2.34").',
            required: false,
        }),
        timeout: Flags.integer({
            char: 't',
            description: 'Timeout for the Actor run in seconds. Zero value means there is no timeout.',
            required: false,
        }),
        memory: Flags.integer({
            char: 'm',
            description: 'Amount of memory allocated for the Actor run, in megabytes.',
            required: false,
        }),
        'wait-for-finish': Flags.string({
            char: 'w',
            description: 'Seconds for waiting to run to finish, if no value passed, it waits forever.',
            required: false,
        }),
    };

    static override args = {
        actorId: Args.string({
            required: false,
            description: 'Name or ID of the Actor to run (e.g. "my-actor", "apify/hello-world" or "E2jjCZBezvAZnX8Rb"). '
            + `If not provided, the command runs the remote Actor specified in the "${LOCAL_CONFIG_PATH}" file.`,
        }),
    };

    async run() {
        const cwd = process.cwd();
        const localConfig = getLocalConfig(cwd) || {};
        const apifyClient = await getLoggedClientOrThrow();
        const userInfo = await getLocalUserInfo();
        const usernameOrId = userInfo.username || userInfo.id;

        const { id: actorId, userFriendlyId } = await this.resolveActorId(apifyClient, localConfig.name as string | undefined, usernameOrId!);

        const runOpts: ActorStartOptions = {
            waitForFinish: 2, // NOTE: We need to wait some time to Apify open stream and we can create connection
        };

        const waitForFinishMillis = Number.isNaN(this.flags.waitForFinish)
            ? undefined
            : Number.parseInt(this.flags.waitForFinish!, 10) * 1000;

        if (this.flags.build) {
            runOpts.build = this.flags.build;
        }

        if (this.flags.timeout) {
            runOpts.timeout = this.flags.timeout;
        }

        if (this.flags.memory) {
            runOpts.memory = this.flags.memory;
        }

        // Get input for act
        const localInput = getLocalInput(cwd);

        runLog(`Calling Actor ${userFriendlyId} (${actorId})`);

        let run: ActorRun;
        try {
            if (localInput) {
                // TODO: For some reason we cannot pass json as buffer with right contentType into apify-client.
                // It will save malformed JSON which looks like buffer as INPUT.
                // We need to fix this in v1 during removing call under actor namespace.
                const input = mime.getExtension(localInput.contentType!) === 'json' ? JSON.parse(localInput.body.toString('utf-8')) : localInput.body;
                run = await apifyClient.actor(actorId).start(input, { ...runOpts, contentType: localInput.contentType! });
            } else {
                run = await apifyClient.actor(actorId).start(null, runOpts);
            }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            // TODO: Better error message in apify-client-js
            if (err.type === 'record-not-found') throw new Error(`Actor ${userFriendlyId} (${actorId}) not found!`);
            else throw err;
        }

        try {
            await outputJobLog(run, waitForFinishMillis);
        } catch (err) {
            warning('Can not get log:');
            console.error(err);
        }

        run = (await apifyClient.run(run.id).get())!;

        link('Actor run detail', `https://console.apify.com/actors/${run.actId}#/runs/${run.id}`);

        if (run.status === ACTOR_JOB_STATUSES.SUCCEEDED) {
            success('Actor finished.');
        } else if (run.status === ACTOR_JOB_STATUSES.RUNNING) {
            warning('Actor is still running!');
        } else if (run.status === ACTOR_JOB_STATUSES.ABORTED || run.status === ACTOR_JOB_STATUSES.ABORTING) {
            warning('Actor was aborted!');
            process.exitCode = CommandExitCodes.RunAborted;
        } else {
            error('Actor failed!');
            process.exitCode = CommandExitCodes.RunFailed;
        }
    }

    private async resolveActorId(client: ApifyClient, localConfigName: string | undefined, usernameOrId: string) {
        const { actorId } = this.args;

        // Full ID
        if (actorId?.includes('/')) {
            const actor = await client.actor(actorId).get();
            if (!actor) throw new Error(`Cannot find Actor with ID '${actorId}' in your account.`);

            return {
                userFriendlyId: actor.username ? `${actor.username}/${actor.name}` : actor.id,
                id: actor.id,
            };
        }

        // Fetch all actors the user has, and see if any of them match the name
        if (actorId) {
            const allActors = await client.actors().list();

            const actor = allActors.items.find((a) => a.name.toLowerCase() === actorId.toLowerCase());

            if (!actor) {
                throw new Error(`Cannot find Actor with name '${actorId}' in your account. Data returned: ${JSON.stringify(allActors.items)}`);
            }

            return {
                userFriendlyId: actor.username ? `${actor.username}/${actor.name}` : actor.id,
                id: actor.id,
            };
        }

        if (localConfigName) {
            const actor = await client.actor(`${usernameOrId}/${localConfigName}`).get();

            if (!actor) {
                throw new Error(`Cannot find Actor with ID '${usernameOrId}/${localConfigName}' `
                    + 'in your account. Call "apify push" to push this Actor to Apify platform.');
            }

            return {
                userFriendlyId: `${actor.username}/${actor.name}`,
                id: actor.id,
            };
        }

        throw new Error('Please provide an Actor ID or name, or run this command from a directory with a valid Apify actor.');
    }
}
