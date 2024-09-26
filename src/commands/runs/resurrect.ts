import { ACTOR_JOB_STATUSES } from '@apify/consts';
import { Args } from '@oclif/core';
import type { ApifyApiError } from 'apify-client';

import { ApifyCommand } from '../../lib/apify_command.js';
import { error, success } from '../../lib/outputs.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

const resurrectStatuses = [
	ACTOR_JOB_STATUSES.SUCCEEDED,
	ACTOR_JOB_STATUSES.FAILED,
	ACTOR_JOB_STATUSES.ABORTED,
	ACTOR_JOB_STATUSES.TIMED_OUT,
];

export class RunsResurrectCommand extends ApifyCommand<typeof RunsResurrectCommand> {
	static override description = 'Resurrects an aborted or finished Actor Run.';

	static override args = {
		runId: Args.string({
			required: true,
			description: 'The run ID to resurrect.',
		}),
	};

	static override enableJsonFlag = true;

	async run() {
		const { runId } = this.args;

		const apifyClient = await getLoggedClientOrThrow();

		const run = await apifyClient.run(runId).get();

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
			const result = await apifyClient.run(runId).resurrect();

			if (this.flags.json) {
				return result;
			}

			success({ message: `Run with ID "${runId}" was resurrected successfully.`, stdout: true });
		} catch (err) {
			const casted = err as ApifyApiError;

			error({
				message: `Failed to resurrect run "${runId}".\n  ${casted.message || casted}`,
				stdout: true,
			});
		}

		return undefined;
	}
}
