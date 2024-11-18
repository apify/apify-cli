import { Args, Flags } from '@oclif/core';
import type { Actor, ActorTaggedBuild, Build } from 'apify-client';

import { ApifyCommand } from '../../lib/apify_command.js';
import { resolveActorContext } from '../../lib/commands/resolve-actor-context.js';
import { error, simpleLog } from '../../lib/outputs.js';
import { getLoggedClientOrThrow } from '../../lib/utils.js';

interface HydratedActorInfo extends Omit<Actor, 'taggedBuilds'> {
	taggedBuilds?: Record<string, ActorTaggedBuild & { build?: Build }>;
}

export class ActorsInfoCommand extends ApifyCommand<typeof ActorsInfoCommand> {
	static override description = 'Get information about an Actor.';

	static override flags = {
		readme: Flags.boolean({
			description: 'Return the Actor README.',
			exclusive: ['input'],
		}),
		input: Flags.boolean({
			description: 'Return the Actor input schema.',
			exclusive: ['readme'],
		}),
	};

	static override args = {
		actorId: Args.string({
			description: 'The ID of the Actor to return information about.',
			required: true,
		}),
	};

	static override enableJsonFlag = true;

	async run() {
		const { actorId } = this.args;
		const { readme, input, json } = this.flags;

		const client = await getLoggedClientOrThrow();
		const ctx = await resolveActorContext({ providedActorNameOrId: actorId, client });

		if (!ctx.valid) {
			error({
				message: `${ctx.reason}. Please specify the Actor ID.`,
				stdout: true,
			});

			return;
		}

		const actorInfo = (await client.actor(ctx.id).get())! as HydratedActorInfo;

		// Hydrate builds
		for (const taggedBuild of Object.values(actorInfo.taggedBuilds ?? {})) {
			if (!taggedBuild.buildId) {
				continue;
			}

			const buildData = await client.build(taggedBuild.buildId).get();

			taggedBuild.build = buildData;
		}

		if (json) {
			return actorInfo;
		}

		const latest = actorInfo.taggedBuilds?.latest;

		if (readme) {
			if (!latest) {
				error({
					message: 'No README found for this Actor.',
					stdout: true,
				});

				return;
			}

			if (!latest.build?.readme) {
				error({
					message: 'No README found for this Actor.',
					stdout: true,
				});

				return;
			}

			simpleLog({ message: latest.build.readme, stdout: true });
		}

		if (input) {
			if (!latest) {
				error({
					message: 'No input schema found for this Actor.',
					stdout: true,
				});

				return;
			}

			if (!latest.build?.inputSchema) {
				error({
					message: 'No input schema found for this Actor.',
					stdout: true,
				});

				return;
			}

			simpleLog({ message: latest.build.inputSchema, stdout: true });
		}
	}
}
