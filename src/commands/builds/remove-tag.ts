import type { ActorTaggedBuild, ApifyApiError } from 'apify-client';
import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { useYesNoConfirm } from '../../lib/hooks/user-confirmations/useYesNoConfirm.js';
import { error, info, success } from '../../lib/outputs.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

export class BuildsRemoveTagCommand extends ApifyCommand<typeof BuildsRemoveTagCommand> {
	static override name = 'remove-tag' as const;

	static override description = 'Removes a tag from a specific Actor build.';

	static override flags = {
		build: Flags.string({
			char: 'b',
			description: 'The build ID to remove the tag from.',
			required: true,
		}),
		tag: Flags.string({
			char: 't',
			description: 'The tag to remove from the build.',
			required: true,
		}),
		yes: Flags.boolean({
			char: 'y',
			description: 'Automatic yes to prompts; assume "yes" as answer to all prompts.',
			default: false,
		}),
	};

	async run() {
		const { build: buildId, tag, yes } = this.flags;

		const apifyClient = await getLoggedClientOrThrow();

		const build = await apifyClient.build(buildId).get();

		if (!build) {
			error({ message: `Build with ID "${buildId}" was not found on your account.`, stdout: true });
			return;
		}

		const actor = await apifyClient.actor(build.actId).get();

		if (!actor) {
			error({ message: `Actor with ID "${build.actId}" was not found.`, stdout: true });
			return;
		}

		const existingTaggedBuilds = (actor.taggedBuilds ?? {}) as Record<string, ActorTaggedBuild>;
		const existingTagData = existingTaggedBuilds[tag];

		// Check if the tag exists
		if (!existingTagData) {
			error({
				message: `Tag "${tag}" does not exist on Actor "${actor.name}".`,
				stdout: true,
			});
			return;
		}

		// Check if the tag points to this build
		if (existingTagData.buildId !== buildId) {
			error({
				message: `Tag "${tag}" is not associated with build "${buildId}". It points to build "${existingTagData.buildNumber}" (${existingTagData.buildId}).`,
				stdout: true,
			});
			return;
		}

		// Confirm removal
		const confirmed = await useYesNoConfirm({
			message: `Are you sure you want to remove tag "${chalk.yellow(tag)}" from build ${chalk.gray(build.buildNumber)}?`,
			providedConfirmFromStdin: yes || undefined,
		});

		if (!confirmed) {
			info({
				message: `Tag removal was canceled.`,
				stdout: true,
			});
			return;
		}

		try {
			// To remove a tag, set it to null
			await apifyClient.actor(build.actId).update({
				taggedBuilds: {
					[tag]: null,
				},
			} as never);

			success({
				message: `Tag "${chalk.yellow(tag)}" removed from build ${chalk.gray(build.buildNumber)} (${chalk.gray(buildId)})`,
				stdout: true,
			});
		} catch (err) {
			const casted = err as ApifyApiError;
			error({
				message: `Failed to remove tag "${tag}" from build "${buildId}".\n  ${casted.message || casted}`,
				stdout: true,
			});
		}
	}
}
