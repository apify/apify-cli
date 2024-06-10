import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

import { Args, Flags } from '@oclif/core';
import { ActorStartOptions, ApifyClient } from 'apify-client';

import { ApifyCommand } from '../lib/apify_command.js';
import { SharedRunOnCloudFlags, runActorOrTaskOnCloud } from '../lib/commands/run-on-cloud.js';
import { CommandExitCodes, LOCAL_CONFIG_PATH } from '../lib/consts.js';
import { error } from '../lib/outputs.js';
import { getLocalConfig, getLocalUserInfo, getLoggedClientOrThrow } from '../lib/utils.js';

export class ActorCallCommand extends ApifyCommand<typeof ActorCallCommand> {
    static override description = 'Runs a specific Actor remotely on the Apify cloud platform.\n'
    + 'The Actor is run under your current Apify account. Therefore you need to be logged in by calling "apify login". '
    + 'It takes input for the Actor from the default local key-value store by default.';

    static override flags = {
        ...SharedRunOnCloudFlags('Actor'),
        input: Flags.string({
            char: 'i',
            // eslint-disable-next-line max-len
            description: 'Optional JSON input to be given to the Actor. You can either provide the JSON string as a value to this, a string of the format `@path/to/file.json`, or `-` to read from standard input.',
            required: false,
            allowStdin: true,
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
        const usernameOrId = userInfo.username || userInfo.id as string;

        const { id: actorId, userFriendlyId } = await ActorCallCommand.resolveActorId({
            client: apifyClient,
            localActorName: localConfig.name as string | undefined,
            usernameOrId,
            actorId: this.args.actorId,
        });

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

        let input: Record<string, unknown> | undefined;

        if (this.flags.input) {
            switch (this.flags.input[0]) {
                case '@': {
                    const fromCwd = this.flags.input.slice(1);
                    const fullPath = join(cwd, fromCwd);

                    try {
                        const fileContent = await readFile(fullPath, 'utf8');
                        input = JSON.parse(fileContent);
                    } catch (err) {
                        error(`Cannot read input file at path "${fullPath}".\n  ${(err as Error).message}`);
                        process.exitCode = CommandExitCodes.InvalidInput;
                        return;
                    }

                    break;
                }
                case '-': {
                    error('You need to pipe something into standard input when you specify the `-` value to `--input`.');
                    process.exitCode = CommandExitCodes.InvalidInput;
                    return;
                }
                default: {
                    try {
                        input = JSON.parse(this.flags.input);
                    } catch (err) {
                        error(`Cannot parse JSON input.\n  ${(err as Error).message}`);
                        process.exitCode = CommandExitCodes.InvalidInput;
                        return;
                    }
                }
            }
        }

        await runActorOrTaskOnCloud(apifyClient, {
            actorOrTaskData: {
                id: actorId,
                userFriendlyId,
            },
            runOptions: runOpts,
            type: 'Actor',
            waitForFinishMillis,
            inputOverride: input,
        });
    }

    private static async resolveActorId({
        client,
        localActorName,
        usernameOrId,
        actorId,
    }: { client: ApifyClient; localActorName: string | undefined; usernameOrId: string; actorId?: string; }) {
        // Full ID
        if (actorId?.includes('/')) {
            const actor = await client.actor(actorId).get();
            if (!actor) {
                throw new Error(`Cannot find Actor with ID '${actorId}' in your account.`);
            }

            return {
                userFriendlyId: `${actor.username}/${actor.name}`,
                id: actor.id,
            };
        }

        // Try fetching Actor directly by name
        if (actorId) {
            const actor = await client.actor(`${usernameOrId}/${actorId.toLowerCase()}`).get();

            if (!actor) {
                throw new Error(`Cannot find Actor with name '${actorId}' in your account.`);
            }

            return {
                userFriendlyId: `${actor.username}/${actor.name}`,
                id: actor.id,
            };
        }

        if (localActorName) {
            const actor = await client.actor(`${usernameOrId}/${localActorName}`).get();

            if (!actor) {
                throw new Error(`Cannot find Actor with ID '${usernameOrId}/${localActorName}' `
                    + 'in your account. Call "apify push" to push this Actor to Apify platform.');
            }

            return {
                userFriendlyId: `${actor.username}/${actor.name}`,
                id: actor.id,
            };
        }

        throw new Error('Please provide an Actor ID or name, or run this command from a directory with a valid Apify Actor.');
    }
}
