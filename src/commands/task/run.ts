import { Args } from '@oclif/core';

import { ApifyCommand } from '../../lib/apify_command.js';
import { SharedRunOnCloudFlags } from '../../lib/commands/run-on-cloud.js';

export class TaskRunCommand extends ApifyCommand<typeof TaskRunCommand> {
    static override description = 'Runs a specific Actor remotely on the Apify cloud platform.\n'
    + 'The Actor is run under your current Apify account. Therefore you need to be logged in by calling "apify login". '
    + 'It takes input for the Actor from the default local key-value store by default.';

    static override flags = SharedRunOnCloudFlags;

    static override args = {
        taskId: Args.string({
            required: true,
            description: 'Name or ID of the Task to run (e.g. "my-task" or "E2jjCZBezvAZnX8Rb").',
        }),
    };
}
