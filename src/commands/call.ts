import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
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
            description: 'Optional JSON input to be given to the Actor.',
            required: false,
            allowStdin: true,
            exclusive: ['input-file'],
        }),
        'input-file': Flags.string({
            aliases: ['if'],
            // eslint-disable-next-line max-len
            description: 'Optional path to a file with JSON input to be given to the Actor. The file must be a valid JSON file. You can also specify `-` to read from standard input.',
            required: false,
            allowStdin: true,
            exclusive: ['input'],
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

        const inputOverride = await this.resolveInputOverride(cwd);

        // Means we couldn't resolve input, so we should exit
        if (inputOverride === false) {
            return;
        }

        await runActorOrTaskOnCloud(apifyClient, {
            actorOrTaskData: {
                id: actorId,
                userFriendlyId,
            },
            runOptions: runOpts,
            type: 'Actor',
            waitForFinishMillis,
            inputOverride,
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

    private async resolveInputOverride(cwd: string) {
        let input: Record<string, unknown> | undefined;

        if (!this.flags.input && !this.flags.inputFile) {
            // Try reading stdin
            const stdin = await this.readStdin(process.stdin);

            if (stdin) {
                try {
                    const parsed = JSON.parse(stdin);

                    if (Array.isArray(parsed)) {
                        throw new Error('The input provided is invalid. It should be an object, not an array.');
                    }

                    input = parsed;
                } catch (err) {
                    error({ message: `Cannot parse JSON input from standard input.\n  ${(err as Error).message}` });
                    process.exitCode = CommandExitCodes.InvalidInput;
                    return false;
                }
            }

            return input;
        }

        if (this.flags.input) {
            switch (this.flags.input[0]) {
                case '-': {
                    error({ message: 'You need to pipe something into standard input when you specify the `-` value to `--input`.' });
                    process.exitCode = CommandExitCodes.InvalidInput;
                    return false;
                }
                default: {
                    try {
                        const parsed = JSON.parse(this.flags.input);

                        if (Array.isArray(parsed)) {
                            throw new Error('The input provided is invalid. It should be an object, not an array.');
                        }

                        input = parsed;
                    } catch (err) {
                        error({ message: `Cannot parse JSON input.\n  ${(err as Error).message}` });
                        process.exitCode = CommandExitCodes.InvalidInput;
                        return false;
                    }
                }
            }
        } else if (this.flags.inputFile) {
            switch (this.flags.inputFile[0]) {
                case '-': {
                    error({ message: 'You need to pipe something into standard input when you specify the `-` value to `--input-file`.' });
                    process.exitCode = CommandExitCodes.InvalidInput;
                    return false;
                }
                default: {
                    const fullPath = resolve(cwd, this.flags.inputFile);

                    try {
                        const fileContent = await readFile(fullPath, 'utf8');
                        const parsed = JSON.parse(fileContent);

                        if (Array.isArray(parsed)) {
                            throw new Error('The input provided is invalid. It should be an object, not an array.');
                        }

                        input = parsed;
                    } catch (err) {
                        error({ message: `Cannot read input file at path "${fullPath}".\n  ${(err as Error).message}` });
                        process.exitCode = CommandExitCodes.InvalidInput;
                        return false;
                    }
                }
            }
        }

        return input;
    }
}
