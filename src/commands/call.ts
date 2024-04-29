import { Args } from '@oclif/core';
import chalk from 'chalk';

import { ActorCallCommand } from './actor/call.js';
import { ApifyCommand } from '../lib/apify_command.js';
import { SharedRunOnCloudFlags } from '../lib/commands/run-on-cloud.js';
import { LOCAL_CONFIG_PATH } from '../lib/consts.js';
import { warning } from '../lib/outputs.js';

export class CallCommand extends ApifyCommand<typeof CallCommand> {
    static override description = `${
        chalk.bgRed('DEPRECATED:')
    } ${chalk.bold('Use "apify actor call" instead.')}\n\nRuns a specific Actor remotely on the Apify cloud platform.\n`
    + 'The Actor is run under your current Apify account. Therefore you need to be logged in by calling "apify login". '
    + 'It takes input for the Actor from the default local key-value store by default.';

    static override flags = SharedRunOnCloudFlags;

    static override args = {
        actorId: Args.string({
            required: false,
            description: 'Name or ID of the Actor to run (e.g. "my-actor", "apify/hello-world" or "E2jjCZBezvAZnX8Rb"). '
            + `If not provided, the command runs the remote Actor specified in the "${LOCAL_CONFIG_PATH}" file.`,
        }),
    };

    async run() {
        warning('This command is deprecated. Please use "apify actor call" instead.');

        await ActorCallCommand.prototype.run.call(this);
    }
}
