import { Flags } from '@oclif/core';
import type { Actor, ActorRunListItem, ActorTaggedBuild, PaginatedList } from 'apify-client';
import chalk from 'chalk';

import { ApifyCommand } from '../../lib/apify_command.js';
import { prettyPrintStatus } from '../../lib/commands/pretty-print-status.js';
import { CompactMode, ResponsiveTable } from '../../lib/commands/responsive-table.js';
import { info, simpleLog } from '../../lib/outputs.js';
import { getLoggedClientOrThrow, ShortDurationFormatter, TimestampFormatter } from '../../lib/utils.js';

const recentlyUsedTable = new ResponsiveTable({
	allColumns: ['Name', 'Runs', 'Last run started at', 'Last run status', 'Last run duration'],
	mandatoryColumns: ['Name', 'Runs', 'Last run started at', 'Last run status', 'Last run duration'],
	columnAlignments: {
		'Runs': 'right',
		'Last run duration': 'right',
		Name: 'center',
		'Last run status': 'center',
	},
});

const myRecentlyUsedTable = new ResponsiveTable({
	allColumns: [
		'Name',
		'Modified at',
		'Builds',
		'Default build',
		'Runs',
		'Last run',
		'Last run status',
		'Last run duration',
	],
	mandatoryColumns: [
		'Name',
		'Modified at',
		'Builds',
		'Default build',
		'Runs',
		'Last run',
		'Last run status',
		'Last run duration',
	],
	columnAlignments: {
		'Builds': 'right',
		'Runs': 'right',
		'Last run duration': 'right',
		Name: 'center',
		'Last run status': 'center',
	},
});

interface HydratedListData {
	id: string;
	createdAt: Date;
	modifiedAt: Date;
	name: string;
	username: string;
	title: string;
	stats: {
		totalRuns: number;
		lastRunStartedAt: string | null;
	};
	actor: Actor | null;
	lastRun: ActorRunListItem | null;
}

export class ActorsLsCommand extends ApifyCommand<typeof ActorsLsCommand> {
	static override description = 'Lists all recently ran Actors or your own Actors.';

	static override flags = {
		my: Flags.boolean({
			description: 'Whether to list Actors made by the logged in user.',
			default: false,
		}),
		offset: Flags.integer({
			description: 'Number of Actors that will be skipped.',
			default: 0,
		}),
		limit: Flags.integer({
			description: 'Number of Actors that will be listed.',
			default: 20,
		}),
		desc: Flags.boolean({
			description: 'Sort Actors in descending order.',
			default: false,
		}),
	};

	static override enableJsonFlag = true;

	async run() {
		const { desc, limit, offset, my, json } = this.flags;

		const client = await getLoggedClientOrThrow();

		const rawActorList = await client.actors().list({ limit, offset, desc, my });

		if (rawActorList.count === 0) {
			if (json) {
				return rawActorList;
			}

			info({
				message: my ? "You don't have any Actors yet!" : 'There are no recent Actors used by you.',
				stdout: true,
			});

			return;
		}

		// Fetch the last run for actors
		const actorList: PaginatedList<HydratedListData> = {
			...rawActorList,
			items: await Promise.all(
				rawActorList.items.map(async (actorData) => {
					const actor = await client.actor(actorData.id).get();
					const runs = await client
						.actor(actorData.id)
						.runs()
						.list({ desc: true, limit: 1 })
						// Throws an error if the returned actor changed publicity status
						.catch(
							() =>
								({
									count: 0,
									desc: true,
									items: [],
									limit: 1,
									offset: 0,
									total: 0,
								}) satisfies PaginatedList<ActorRunListItem>,
						);

					return {
						...actorData,
						actor: actor ?? null,
						lastRun: (runs.items[0] ?? null) as ActorRunListItem | null,
					} as HydratedListData;
				}),
			),
		};

		actorList.items = my ? this.sortByModifiedAt(actorList.items) : this.sortByLastRun(actorList.items);

		if (json) {
			return actorList;
		}

		const table = my ? myRecentlyUsedTable : recentlyUsedTable;

		for (const item of actorList.items) {
			const lastRunDisplayedTimestamp = item.stats.lastRunStartedAt
				? TimestampFormatter.display(item.stats.lastRunStartedAt)
				: '';

			const lastRunDuration = item.lastRun
				? (() => {
						if (item.lastRun.finishedAt) {
							return chalk.gray(
								ShortDurationFormatter.format(
									item.lastRun.finishedAt.getTime() - item.lastRun.startedAt.getTime(),
								),
							);
						}

						const duration = Date.now() - item.lastRun.startedAt.getTime();

						return chalk.gray(`${ShortDurationFormatter.format(duration)} ...`);
					})()
				: '';

			const defaultBuild = item.actor
				? (() => {
						const buildVersionToTag = Object.entries(
							(item.actor.taggedBuilds ?? {}) as Record<string, ActorTaggedBuild>,
						).find(
							([tag, data]) =>
								data.buildNumber === item.actor!.defaultRunOptions.build ||
								tag === item.actor!.defaultRunOptions.build,
						);

						if (buildVersionToTag) {
							return `${chalk.yellow(buildVersionToTag[0])} / ${chalk.cyan(buildVersionToTag[1].buildNumber ?? item.actor.defaultRunOptions.build)}`;
						}

						return chalk.gray('Unknown');
					})()
				: chalk.gray('Unknown');

			table.pushRow({
				Name: `${item.title}\n${chalk.gray(`${item.username}/${item.name}`)}`,
				Runs: chalk.cyan(`${item.stats?.totalRuns ?? 0}`),
				'Last run started at': lastRunDisplayedTimestamp,
				'Last run': lastRunDisplayedTimestamp,
				'Last run status': item.lastRun ? prettyPrintStatus(item.lastRun.status) : '',
				'Modified at': TimestampFormatter.display(item.modifiedAt),
				Builds: item.actor ? chalk.cyan(item.actor.stats.totalBuilds) : chalk.gray('Unknown'),
				'Last run duration': lastRunDuration,
				'Default build': defaultBuild,
			});
		}

		simpleLog({
			message: table.render(CompactMode.WebLikeCompact),
			stdout: true,
		});

		return undefined;
	}

	private sortByModifiedAt(items: HydratedListData[]) {
		return items.sort((a, b) => {
			const aDate = new Date(a.modifiedAt);
			const bDate = new Date(b.modifiedAt);

			return bDate.getTime() - aDate.getTime();
		});
	}

	private sortByLastRun(items: HydratedListData[]) {
		return items.sort((a, b) => {
			const aDate = new Date(a.stats?.lastRunStartedAt ?? '1970-01-01T00:00Z');
			const bDate = new Date(b.stats?.lastRunStartedAt ?? '1970-01-01T00:00Z');

			return bDate.getTime() - aDate.getTime();
		});
	}
}
