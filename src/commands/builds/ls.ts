import { Flags } from '@oclif/core';
import type { BuildCollectionClientListItem } from 'apify-client';
import chalk from 'chalk';

import { ApifyCommand } from '../../lib/apify_command.js';
import { prettyPrintStatus } from '../../lib/commands/pretty-print-status.js';
import { resolveActorContext } from '../../lib/commands/resolve-actor-context.js';
import { ResponsiveTable } from '../../lib/commands/responsive-table.js';
import { error, simpleLog } from '../../lib/outputs.js';
import { getLoggedClientOrThrow, objectGroupBy, ShortDurationFormatter } from '../../lib/utils.js';

const tableFactory = () =>
	new ResponsiveTable({
		allColumns: ['Number', 'ID', 'Status', 'Took'],
		mandatoryColumns: ['Number', 'ID', 'Status', 'Took'],
	});

export class BuildLsCommand extends ApifyCommand<typeof BuildLsCommand> {
	static override description = 'Lists all builds of the Actor.';

	static override flags = {
		actor: Flags.string({
			description:
				'Optional Actor ID or Name to list builds for. By default, it will use the Actor from the current directory.',
		}),
		offset: Flags.integer({
			description: 'Number of builds that will be skipped.',
			default: 0,
		}),
		limit: Flags.integer({
			description: 'Number of builds that will be listed.',
			default: 10,
		}),
		desc: Flags.boolean({
			description: 'Sort builds in descending order.',
			default: false,
		}),
		compact: Flags.boolean({
			description: 'Display a compact table.',
			default: false,
			char: 'c',
		}),
	};

	static override enableJsonFlag = true;

	async run() {
		const { actor, desc, limit, offset, compact, json } = this.flags;

		const client = await getLoggedClientOrThrow();

		// TODO: technically speaking, we don't *need* an actor id to list builds. But it makes more sense to have a table of builds for a specific actor.
		const ctx = await resolveActorContext({ providedActorNameOrId: actor, client });

		if (!ctx.valid) {
			error({
				message: `${ctx.reason}. Please run this command in an Actor directory, or specify the Actor ID by running this command with "--actor=<id>".`,
			});

			return;
		}

		const allBuilds = await client.actor(ctx.id).builds().list({ desc, limit, offset });
		const actorInfo = (await client.actor(ctx.id).get())!;

		const buildsByActorVersion = objectGroupBy(allBuilds.items, (item) => {
			const versionNumber = Reflect.get(item, 'buildNumber') as string;

			const [major, minor] = versionNumber.split('.');

			return `${major}.${minor}`;
		});

		const buildTagToActorVersion = Object.entries(actorInfo.taggedBuilds ?? {}).reduce(
			(acc, [tag, data]) => {
				acc[data.buildNumber] = tag;

				return acc;
			},
			{} as Record<string, string>,
		);

		if (json) {
			// Hydrate the builds with their tags
			for (const build of allBuilds.items) {
				// TODO: untyped field, https://github.com/apify/apify-client-js/issues/526
				const buildNumber = Reflect.get(build, 'buildNumber') as string;

				const hasTag = buildTagToActorVersion[buildNumber];

				if (hasTag) {
					Reflect.set(build, 'buildTag', hasTag);
				}
			}

			return allBuilds;
		}

		simpleLog({
			message: `${chalk.reset('Showing')} ${chalk.yellow(allBuilds.items.length)} out of ${chalk.yellow(allBuilds.total)} builds for Actor ${chalk.yellow(ctx.userFriendlyId)} (${chalk.gray(ctx.id)})\n`,
		});

		const sortedActorVersions = Object.entries(buildsByActorVersion).sort((a, b) => a[0].localeCompare(b[0]));

		for (const [actorVersion, buildsForVersion] of sortedActorVersions) {
			if (!buildsForVersion?.length) {
				simpleLog({
					message: `No builds for version ${actorVersion}`,
				});

				continue;
			}

			const latestBuildTag = actorInfo.versions.find((v) => v.versionNumber === actorVersion)?.buildTag;
			const table = this.generateTableForActorVersion({
				buildsForVersion,
				buildTagToActorVersion,
			});

			const latestBuildTagMessage = latestBuildTag
				? ` (latest build gets tagged with ${chalk.yellow(latestBuildTag)})`
				: '';

			const message = [
				chalk.reset(`Builds for Actor Version ${chalk.yellow(actorVersion)}${latestBuildTagMessage}`),
				table.render(compact),
				'',
			];

			simpleLog({
				message: message.join('\n'),
			});
		}

		return undefined;
	}

	private generateTableForActorVersion({
		buildsForVersion,
		buildTagToActorVersion,
	}: {
		buildsForVersion: BuildCollectionClientListItem[];
		buildTagToActorVersion: Record<string, string>;
	}) {
		const table = tableFactory();

		for (const build of buildsForVersion) {
			// TODO: untyped field, https://github.com/apify/apify-client-js/issues/526
			const buildNumber = Reflect.get(build, 'buildNumber') as string;

			const hasTag = buildTagToActorVersion[buildNumber]
				? ` (${chalk.yellow(buildTagToActorVersion[buildNumber])})`
				: '';

			let finishedAt: string;

			if (build.finishedAt) {
				const diff = build.finishedAt.getTime() - build.startedAt.getTime();

				finishedAt = chalk.gray(`${ShortDurationFormatter.format(diff, undefined, { left: '' })}`);
			} else {
				const diff = Date.now() - build.startedAt.getTime();
				finishedAt = chalk.gray(`Running for ${ShortDurationFormatter.format(diff, undefined, { left: '' })}`);
			}

			table.pushRow({
				Number: `${buildNumber}${hasTag}`,
				ID: chalk.gray(build.id),
				Status: prettyPrintStatus(build.status),
				Took: finishedAt,
			});
		}

		return table;
	}
}
