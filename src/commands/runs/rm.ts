import { ACTOR_JOB_STATUSES } from '@apify/consts';
import { Args } from '@oclif/core';
import type { ApifyApiError } from 'apify-client';

import { ApifyCommand } from '../../lib/apify_command.js';
import { confirmAction } from '../../lib/utils/confirm.js';
import { error, info, success } from '../../lib/outputs.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

const deletableStatuses = [
	ACTOR_JOB_STATUSES.SUCCEEDED,
	ACTOR_JOB_STATUSES.FAILED,
	ACTOR_JOB_STATUSES.ABORTED,
	ACTOR_JOB_STATUSES.TIMED_OUT,
];

export class RunsRmCommand extends ApifyCommand<typeof RunsRmCommand> {
	static override description = 'Deletes an Actor Run.';

	static override args = {
		runId: Args.string({
			description: 'The run ID to delete.',
			required: true,
		}),
	};

	async run() {
		const { runId } = this.args;

		const apifyClient = await getLoggedClientOrThrow();

		const run = await apifyClient.run(runId).get();

		if (!run) {
			error({ message: `Run with ID "${runId}" was not found on your account.` });
			return;
		}

		if (!deletableStatuses.includes(run.status as never)) {
			error({
				message: `Run with ID "${runId}" cannot be deleted, as it is still running or in the process of aborting.`,
			});

			return;
		}

		const confirmedDelete = await confirmAction({
			type: 'Actor Run',
			failureMessage: `Your provided value does not match the run ID.`,
		});

		if (!confirmedDelete) {
			info({
				message: `Deletion of run "${runId}" was canceled.`,
			});

			return;
		}

		try {
			await apifyClient.run(runId).delete();

			success({
				message: `Run with ID "${runId}" was deleted.`,
			});
		} catch (err) {
			const casted = err as ApifyApiError;
			error({ message: `Failed to delete run "${runId}".\n  ${casted.message || casted}` });
		}
	}
}
