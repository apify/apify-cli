import type { ApifyApiError } from 'apify-client';

import { ACTOR_JOB_STATUSES } from '@apify/consts';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { error, success } from '../../lib/outputs.js';
import { printJsonToStdout } from '../../lib/utils.js';

const resurrectStatuses = [
	ACTOR_JOB_STATUSES.SUCCEEDED,
	ACTOR_JOB_STATUSES.FAILED,
	ACTOR_JOB_STATUSES.ABORTED,
	ACTOR_JOB_STATUSES.TIMED_OUT,
];

export class RunsResurrectCommand extends ApifyCommand<typeof RunsResurrectCommand> {
	static override name = 'resurrect' as const;

	static override description = 'Resurrects an aborted or finished Actor Run.';

	static override args = {
		runId: Args.string({
			required: true,
			description: 'The run ID to resurrect.',
		}),
	};

	static override enableJsonFlag = true;

	static override requiresAuthentication = 'always' as const;

	async run() {
		const { runId } = this.args;

		const run = await this.apifyClient.run(runId).get();

		if (!run) {
			error({ message: `Run with ID "${runId}" was not found on your account.`, stdout: true });
			return;
		}

		if (!resurrectStatuses.includes(run.status as never)) {
			error({
				message: `Run with ID "${runId}" cannot be resurrected, as it is still running or in the process of aborting.`,
				stdout: true,
			});

			return;
		}

		try {
			const result = await this.apifyClient.run(runId).resurrect();

			if (this.flags.json) {
				printJsonToStdout(result);
				return;
			}

			success({ message: `Run with ID "${runId}" was resurrected successfully.`, stdout: true });
		} catch (err) {
			const casted = err as ApifyApiError;

			error({
				message: `Failed to resurrect run "${runId}".\n  ${casted.message || casted}`,
				stdout: true,
			});
		}
	}
}
