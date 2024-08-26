import { Flags } from '@oclif/core';
import chalk from 'chalk';
import Table from 'cli-table';

import { ApifyCommand } from '../../lib/apify_command.js';
import { prettyPrintStatus } from '../../lib/commands/pretty-print-status.js';
import { resolveActorContext } from '../../lib/commands/resolve-actor-context.js';
import { error, simpleLog } from '../../lib/outputs.js';
import { DurationFormatter, getLoggedClientOrThrow, objectGroupBy, TimestampFormatter } from '../../lib/utils.js';

const tableFactory = () =>
	new Table<[string, string, string, string, string]>({
		head: ['Number', 'ID', 'Status', 'Started At', 'Finished At'],
		style: {
			head: ['cyan', 'cyan', 'cyan', 'cyan', 'cyan'],
		},
	});

export class BuildLsCommand extends ApifyCommand<typeof BuildLsCommand> {
	static override description = 'Lists all builds of the actor.';

	static override flags = {
		actor: Flags.string({
			description:
				'Optional Actor ID or Name to list builds for. By default, it will use the Actor from the current directory',
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
	};

	static override enableJsonFlag = true;

	async run() {
		const { actor, desc, limit, offset, json } = this.flags;

		const client = await getLoggedClientOrThrow();

		// TODO: technically speaking, we don't *need* an actor id to list builds. But it makes more sense to have a table of builds for a specific actor.
		const ctx = await resolveActorContext({ providedActorNameOrId: actor, client });

		if (!ctx) {
			error({
				message:
					'Unable to detect what Actor to list the builds for. Please run this command in an Actor directory, or specify the Actor ID by running this command with "--actor=<id>"',
			});

			return;
		}

		const builds = await client.actor(ctx.id).builds().list({ desc, limit, offset });

		if (json) {
			return builds;
		}

		const actorInfo = (await client.actor(ctx.id).get())!;

		simpleLog({
			message: `${chalk.reset('Showing')} ${chalk.yellow(builds.items.length)} out of ${chalk.yellow(builds.total)} builds for Actor ${chalk.yellow(ctx.userFriendlyId)} (${chalk.gray(ctx.id)})\n`,
		});

		const result = objectGroupBy(builds.items, (item) => {
			const versionNumber = Reflect.get(item, 'buildNumber') as string;

			const [major, minor] = versionNumber.split('.');

			return `${major}.${minor}`;
		});

		const versionToTag = Object.entries(actorInfo.taggedBuilds ?? {}).reduce(
			(acc, [tag, data]) => {
				acc[data.buildNumber] = tag;

				return acc;
			},
			{} as Record<string, string>,
		);

		for (const [actorVersion, buildsForVersion] of Object.entries(result).sort((a, b) =>
			a[0].localeCompare(b[0]),
		)) {
			if (!buildsForVersion?.length) {
				simpleLog({
					message: `No builds for version ${actorVersion}`,
				});

				continue;
			}

			const latestBuildGetsTaggedAs = actorInfo.versions.find((v) => v.versionNumber === actorVersion)?.buildTag;

			const table = tableFactory();

			for (const build of buildsForVersion) {
				const buildNumber = Reflect.get(build, 'buildNumber') as string;

				const hasTag = versionToTag[buildNumber];

				const tableRow: [string, string, string, string, string] = [
					`${buildNumber}${hasTag ? ` (${chalk.yellow(hasTag)})` : ''}`,
					chalk.gray(build.id),
					prettyPrintStatus(build.status),
					TimestampFormatter.display(build.startedAt),
					'',
				];

				if (build.finishedAt) {
					tableRow[4] = TimestampFormatter.display(build.finishedAt);
				} else {
					const diff = Date.now() - build.startedAt.getTime();
					tableRow[4] = chalk.gray(`Running for ${DurationFormatter.format(diff)}`);
				}

				table.push(tableRow);
			}

			simpleLog({
				message: chalk.reset(
					`Builds for Actor Version ${chalk.yellow(actorVersion)}${latestBuildGetsTaggedAs ? ` (latest build gets tagged with ${chalk.yellow(latestBuildGetsTaggedAs)})` : ''}`,
				),
			});

			simpleLog({
				message: table.toString(),
			});

			simpleLog({
				message: '',
			});
		}

		return undefined;
	}
}
