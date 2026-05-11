import { RunsRmCommandMessages } from '#i18n/commands/runs/rm.js';
import type { ApifyApiError } from 'apify-client';

import { ACTOR_JOB_STATUSES } from '@apify/consts';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { YesFlag } from '../../lib/command-framework/flags.js';
import { useYesNoConfirm } from '../../lib/hooks/user-confirmations/useYesNoConfirm.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

const deletableStatuses = [
	ACTOR_JOB_STATUSES.SUCCEEDED,
	ACTOR_JOB_STATUSES.FAILED,
	ACTOR_JOB_STATUSES.ABORTED,
	ACTOR_JOB_STATUSES.TIMED_OUT,
];

export class RunsRmCommand extends ApifyCommand<typeof RunsRmCommand> {
	static override name = 'rm' as const;

	static override description = 'Deletes an Actor Run.';

	static override interactive = true;

	static override interactiveNote =
		'Prompts for confirmation before deleting. Cannot be bypassed; deletion is irreversible.';

	static override examples = [
		{
			description: 'Delete a finished or aborted run (prompts for confirmation).',
			command: 'apify runs rm <runId>',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-runs-rm';

	static override args = {
		runId: Args.string({
			description: 'The run ID to delete.',
			required: true,
		}),
	};

	static override flags = {
		...YesFlag(),
	};

	async run() {
		const { runId } = this.args;
		const { yes } = this.flags;

		const apifyClient = await getLoggedClientOrThrow();

		const run = await apifyClient.run(runId).get();

		if (!run) {
			this.logger.stderr.error(this.t(RunsRmCommandMessages.runNotFound, { runId }));
			return;
		}

		if (!deletableStatuses.includes(run.status as never)) {
			this.logger.stderr.error(this.t(RunsRmCommandMessages.cannotDelete, { runId }));

			return;
		}

		const confirmedDelete = await useYesNoConfirm({
			message: `Are you sure you want to delete this Actor Run?`,
			providedConfirmFromStdin: yes || undefined,
		});

		if (!confirmedDelete) {
			this.logger.stderr.info(this.t(RunsRmCommandMessages.deletionCanceled, { runId }));

			return;
		}

		try {
			await apifyClient.run(runId).delete();

			this.logger.stderr.success(this.t(RunsRmCommandMessages.deleted, { runId }));
		} catch (err) {
			const casted = err as ApifyApiError;
			this.logger.stderr.error(
				this.t(RunsRmCommandMessages.deleteFailed, { runId, message: String(casted.message || casted) }),
			);
		}
	}
}
