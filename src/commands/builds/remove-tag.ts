import type { ActorTaggedBuild, ApifyApiError } from 'apify-client';
import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Flags, YesFlag } from '../../lib/command-framework/flags.js';
import { useYesNoConfirm } from '../../lib/hooks/user-confirmations/useYesNoConfirm.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

export class BuildsRemoveTagCommand extends ApifyCommand<typeof BuildsRemoveTagCommand> {
	static override name = 'remove-tag' as const;

	static override description = 'Removes a tag from a specific Actor build.';

	static override examples = [
		{
			description: 'Remove a tag from a build (prompts for confirmation).',
			command: 'apify builds remove-tag --build <buildId> --tag beta',
		},
		{
			description: 'Remove a tag non-interactively.',
			command: 'apify builds remove-tag --build <buildId> --tag beta --yes',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-builds-remove-tag';

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
		...YesFlag(),
	};

	async run() {
		const { build: buildId, tag, yes } = this.flags;

		const apifyClient = await getLoggedClientOrThrow();

		const build = await apifyClient.build(buildId).get();

		if (!build) {
			this.logger.stdout.error(`Build with ID "${buildId}" was not found on your account.`);
			return;
		}

		const actor = await apifyClient.actor(build.actId).get();

		if (!actor) {
			this.logger.stdout.error(`Actor with ID "${build.actId}" was not found.`);
			return;
		}

		const existingTaggedBuilds = (actor.taggedBuilds ?? {}) as Record<string, ActorTaggedBuild>;
		const existingTagData = existingTaggedBuilds[tag];

		// Check if the tag exists
		if (!existingTagData) {
			this.logger.stdout.error(`Tag "${tag}" does not exist on Actor "${actor.name}".`);
			return;
		}

		// Check if the tag points to this build
		if (existingTagData.buildId !== buildId) {
			this.logger.stdout.error(
				`Tag "${tag}" is not associated with build "${buildId}". It points to build "${existingTagData.buildNumber}" (${existingTagData.buildId}).`,
			);
			return;
		}

		// Confirm removal
		const confirmed = await useYesNoConfirm({
			message: `Are you sure you want to remove tag "${chalk.yellow(tag)}" from build ${chalk.gray(build.buildNumber)}?`,
			providedConfirmFromStdin: yes || undefined,
		});

		if (!confirmed) {
			this.logger.stdout.info(`Tag removal was canceled.`);
			return;
		}

		try {
			// To remove a tag, set it to null
			await apifyClient.actor(build.actId).update({
				taggedBuilds: {
					[tag]: null,
				},
			} as never);

			this.logger.stdout.success(
				`Tag "${chalk.yellow(tag)}" removed from build ${chalk.gray(build.buildNumber)} (${chalk.gray(buildId)})`,
			);
		} catch (err) {
			const casted = err as ApifyApiError;
			this.logger.stdout.error(
				`Failed to remove tag "${tag}" from build "${buildId}".\n  ${casted.message || casted}`,
			);
		}
	}
}
