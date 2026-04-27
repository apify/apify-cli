import type { ActorTaggedBuild, ApifyApiError } from 'apify-client';
import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

export class BuildsAddTagCommand extends ApifyCommand<typeof BuildsAddTagCommand> {
	static override name = 'add-tag' as const;

	static override description = 'Adds a tag to a specific Actor build.';

	static override examples = [
		{
			description: 'Tag a successful build as "latest".',
			command: 'apify builds add-tag --build <buildId> --tag latest',
		},
		{
			description: 'Tag a build with a custom name like "beta".',
			command: 'apify builds add-tag --build <buildId> --tag beta',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-builds-add-tag';

	static override flags = {
		build: Flags.string({
			char: 'b',
			description: 'The build ID to tag.',
			required: true,
		}),
		tag: Flags.string({
			char: 't',
			description: 'The tag to add to the build.',
			required: true,
		}),
	};

	async run() {
		const { build: buildId, tag } = this.flags;

		const apifyClient = await getLoggedClientOrThrow();

		const build = await apifyClient.build(buildId).get();

		if (!build) {
			this.logger.stdout.error(`Build with ID "${buildId}" was not found on your account.`);
			return;
		}

		if (build.status !== 'SUCCEEDED') {
			this.logger.stdout.error(
				`Build with ID "${buildId}" has status "${build.status}". Only successful builds can be tagged.`,
			);
			return;
		}

		const actor = await apifyClient.actor(build.actId).get();

		if (!actor) {
			this.logger.stdout.error(`Actor with ID "${build.actId}" was not found.`);
			return;
		}

		// Check if this tag already points to the same build
		const existingTaggedBuilds = (actor.taggedBuilds ?? {}) as Record<string, ActorTaggedBuild>;
		const existingTagData = existingTaggedBuilds[tag];

		if (existingTagData?.buildId === buildId) {
			this.logger.stdout.warning(`Build "${buildId}" is already tagged as "${tag}".`);
			return;
		}

		try {
			// Update only the specific tag
			await apifyClient.actor(build.actId).update({
				taggedBuilds: {
					[tag]: {
						buildId: build.id,
					},
				},
			} as never);

			const previousBuildInfo = existingTagData?.buildNumber
				? ` (previously pointed to build ${chalk.gray(existingTagData.buildNumber)})`
				: '';

			this.logger.stdout.success(
				`Tag "${chalk.yellow(tag)}" added to build ${chalk.gray(build.buildNumber)} (${chalk.gray(buildId)})${previousBuildInfo}`,
			);
		} catch (err) {
			const casted = err as ApifyApiError;
			this.logger.stdout.error(
				`Failed to add tag "${tag}" to build "${buildId}".\n  ${casted.message || casted}`,
			);
		}
	}
}
