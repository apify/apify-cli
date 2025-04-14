import { Args } from '@oclif/core';
import type { ApifyApiError } from 'apify-client';

import { ApifyCommand } from '../../lib/apify_command.js';
import { error, info, success } from '../../lib/outputs.js';
import { confirmAction } from '../../lib/utils/confirm.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

export class ActorRmCommand extends ApifyCommand<typeof ActorRmCommand> {
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
