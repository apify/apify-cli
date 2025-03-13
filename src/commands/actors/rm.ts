import type { ApifyApiError } from 'apify-client';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { error, info, success } from '../../lib/outputs.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';
import { confirmAction } from '../../lib/utils/confirm.js';

export class ActorsRmCommand extends ApifyCommand<typeof ActorsRmCommand> {
	static override name = 'rm';

	static override description = 'Permanently removes an Actor from your account.';

	static override args = {
		actorId: Args.string({
			description: 'The Actor ID to delete.',
			required: true,
		}),
	};

	async run() {
		const { actorId } = this.args;

		const apifyClient = await getLoggedClientOrThrow();

		const actor = await apifyClient.actor(actorId).get();

		if (!actor) {
			error({ message: `Actor with ID "${actorId}" was not found on your account.` });
			return;
		}

		const confirmedDelete = await confirmAction({
			type: 'Actor',
			failureMessage: `Your provided value does not match the Actor ID.`,
		});

		if (!confirmedDelete) {
			info({
				message: `Deletion of Actor "${actorId}" was canceled.`,
			});
			return;
		}

		try {
			await apifyClient.actor(actorId).delete();

			success({ message: `Actor with ID "${actorId}" was deleted.` });
		} catch (err) {
			const casted = err as ApifyApiError;
			error({ message: `Failed to delete Actor "${actorId}".\n  ${casted.message || casted}` });
		}
	}
}
