import type { ActorTaggedBuild, ApifyApiError } from 'apify-client';
import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { error, success, warning } from '../../lib/outputs.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

export class BuildsAddTagCommand extends ApifyCommand<typeof BuildsAddTagCommand> {
	static override name = 'add-tag' as const;

	static override description = 'Adds a tag to a specific Actor build.';

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
			error({ message: `Build with ID "${buildId}" was not found on your account.`, stdout: true });
			return;
		}

		if (build.status !== 'SUCCEEDED') {
			error({
				message: `Build with ID "${buildId}" has status "${build.status}". Only successful builds can be tagged.`,
				stdout: true,
			});
			return;
		}

		const actor = await apifyClient.actor(build.actId).get();

		if (!actor) {
			error({ message: `Actor with ID "${build.actId}" was not found.`, stdout: true });
			return;
		}

		// Check if this tag already points to the same build
		const existingTaggedBuilds = (actor.taggedBuilds ?? {}) as Record<string, ActorTaggedBuild>;
		const existingTagData = existingTaggedBuilds[tag];

		if (existingTagData?.buildId === buildId) {
			warning({
				message: `Build "${buildId}" is already tagged as "${tag}".`,
				stdout: true,
			});
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

			success({
				message: `Tag "${chalk.yellow(tag)}" added to build ${chalk.gray(build.buildNumber)} (${chalk.gray(buildId)})${previousBuildInfo}`,
				stdout: true,
			});
		} catch (err) {
			const casted = err as ApifyApiError;
			error({
				message: `Failed to add tag "${tag}" to build "${buildId}".\n  ${casted.message || casted}`,
				stdout: true,
			});
		}
	}
}
