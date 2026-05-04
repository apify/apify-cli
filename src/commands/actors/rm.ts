import type { ApifyApiError } from 'apify-client';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { YesFlag } from '../../lib/command-framework/flags.js';
import { useYesNoConfirm } from '../../lib/hooks/user-confirmations/useYesNoConfirm.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

export class ActorsRmCommand extends ApifyCommand<typeof ActorsRmCommand> {
	static override name = 'rm' as const;

	static override description = 'Permanently removes an Actor from your account.';

	static override interactive = true;

	static override interactiveNote =
		'Prompts for confirmation before deleting. Cannot be bypassed; deletion is irreversible.';

	static override examples = [
		{
			description: 'Delete an Actor by its full name (prompts for confirmation).',
			command: 'apify actors rm my-username/my-actor',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-actors-rm';

	static override args = {
		actorId: Args.string({
			description: 'The Actor ID to delete.',
			required: true,
		}),
	};

	static override flags = {
		...YesFlag(),
	};

	async run() {
		const { actorId } = this.args;
		const { yes } = this.flags;

		const apifyClient = await getLoggedClientOrThrow();

		const actor = await apifyClient.actor(actorId).get();

		if (!actor) {
			this.logger.stderr.error(`Actor with ID "${actorId}" was not found on your account.`);
			return;
		}

		const confirmedDelete = await useYesNoConfirm({
			message: `Are you sure you want to delete this Actor?`,
			providedConfirmFromStdin: yes || undefined,
		});

		if (!confirmedDelete) {
			this.logger.stderr.info(`Deletion of Actor "${actorId}" was canceled.`);
			return;
		}

		try {
			await apifyClient.actor(actorId).delete();

			this.logger.stderr.success(`Actor with ID "${actorId}" was deleted.`);
		} catch (err) {
			const casted = err as ApifyApiError;
			this.logger.stderr.error(`Failed to delete Actor "${actorId}".\n  ${casted.message || casted}`);
		}
	}
}
