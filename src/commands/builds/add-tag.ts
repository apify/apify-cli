import { BuildsAddTagCommandMessages } from '#i18n/commands/builds/add-tag.js';
import type { ActorTaggedBuild, ApifyApiError } from 'apify-client';

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
			this.logger.stdout.error(this.t(BuildsAddTagCommandMessages.buildNotFound, { buildId }));
			return;
		}

		if (build.status !== 'SUCCEEDED') {
			this.logger.stdout.error(
				this.t(BuildsAddTagCommandMessages.buildNotSucceeded, { buildId, status: build.status }),
			);
			return;
		}

		const actor = await apifyClient.actor(build.actId).get();

		if (!actor) {
			this.logger.stdout.error(this.t(BuildsAddTagCommandMessages.actorNotFound, { actorId: build.actId }));
			return;
		}

		// Check if this tag already points to the same build
		const existingTaggedBuilds = (actor.taggedBuilds ?? {}) as Record<string, ActorTaggedBuild>;
		const existingTagData = existingTaggedBuilds[tag];

		if (existingTagData?.buildId === buildId) {
			this.logger.stdout.warning(this.t(BuildsAddTagCommandMessages.tagAlreadyPointsToBuild, { buildId, tag }));
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

			if (existingTagData?.buildNumber) {
				this.logger.stdout.success(
					this.t(BuildsAddTagCommandMessages.tagAddedWithPrevious, {
						tag,
						buildNumber: build.buildNumber,
						buildId,
						previousBuildNumber: existingTagData.buildNumber,
					}),
				);
			} else {
				this.logger.stdout.success(
					this.t(BuildsAddTagCommandMessages.tagAdded, {
						tag,
						buildNumber: build.buildNumber,
						buildId,
					}),
				);
			}
		} catch (err) {
			const casted = err as ApifyApiError;
			this.logger.stdout.error(
				this.t(BuildsAddTagCommandMessages.tagAddFailed, {
					tag,
					buildId,
					errorMessage: casted.message || String(casted),
				}),
			);
		}
	}
}
