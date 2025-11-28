import type { ActorTaggedBuild, ApifyApiError } from 'apify-client';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { useInputConfirmation } from '../../lib/hooks/user-confirmations/useInputConfirmation.js';
import { useYesNoConfirm } from '../../lib/hooks/user-confirmations/useYesNoConfirm.js';
import { error, info, success } from '../../lib/outputs.js';

export class BuildsRmCommand extends ApifyCommand<typeof BuildsRmCommand> {
	static override name = 'rm' as const;

	static override description = 'Permanently removes an Actor build from the Apify platform.';

	static override args = {
		buildId: Args.string({
			description: 'The build ID to delete.',
			required: true,
		}),
	};

	static override requiresAuthentication = 'always' as const;

	async run() {
		const { buildId } = this.args;

		const build = await this.apifyClient.build(buildId).get();

		if (!build) {
			error({ message: `Build with ID "${buildId}" was not found on your account.`, stdout: true });
			return;
		}

		const actor = await this.apifyClient.actor(build.actId).get();

		let confirmationPrompt: string | undefined;

		if (actor?.taggedBuilds) {
			// If this build is tagged in the actor, console asks you to write the tag.
			for (const [tag, buildData] of Object.entries(actor.taggedBuilds) as [string, ActorTaggedBuild][]) {
				if (buildId === buildData.buildId) {
					confirmationPrompt = tag;
					break;
				}
			}
		}

		// If the build is tagged, console asks you to confirm by typing in the tag. Otherwise, it asks you to confirm with a yes/no question.
		const confirmed = await (confirmationPrompt ? useInputConfirmation : useYesNoConfirm)({
			message: `Are you sure you want to delete this Actor Build?${confirmationPrompt ? ` If so, please type in "${confirmationPrompt}":` : ''}`,
			expectedValue: confirmationPrompt ?? '',
			failureMessage: 'Your provided value does not match the build tag.',
		});

		if (!confirmed) {
			info({
				message: `Deletion of build "${buildId}" was canceled.`,
				stdout: true,
			});

			return;
		}

		try {
			await this.apifyClient.build(buildId).delete();

			success({
				message: `Build with ID "${buildId}" was deleted.`,
				stdout: true,
			});
		} catch (err) {
			const casted = err as ApifyApiError;
			error({ message: `Failed to delete build "${buildId}".\n  ${casted.message || casted}`, stdout: true });
		}
	}
}
