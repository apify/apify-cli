import { Time } from '@sapphire/duration';
import type {
	Actor,
	ActorCollectionListItem,
	ActorRunListItem,
	ActorTaggedBuild,
	ApifyClient,
	PaginatedList,
} from 'apify-client';
import chalk from 'chalk';

import type { ACTOR_JOB_STATUSES } from '@apify/consts';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { prettyPrintStatus } from '../../lib/commands/pretty-print-status.js';
import { CompactMode, kSkipColumn, ResponsiveTable } from '../../lib/commands/responsive-table.js';
import { info, simpleLog } from '../../lib/outputs.js';
import {
	DateOnlyTimestampFormatter,
	getLoggedClientOrThrow,
	MultilineTimestampFormatter,
	printJsonToStdout,
	ShortDurationFormatter,
} from '../../lib/utils.js';

const statusMap: Record<(typeof ACTOR_JOB_STATUSES)[keyof typeof ACTOR_JOB_STATUSES], string> = {
	'TIMED-OUT': chalk.gray('after'),
	'TIMING-OUT': chalk.gray('after'),
	ABORTED: chalk.gray('after'),
	ABORTING: chalk.gray('after'),
	FAILED: chalk.gray('after'),
	READY: chalk.gray('for'),
	RUNNING: chalk.gray('for'),
	SUCCEEDED: chalk.gray('after'),
};

const recentlyUsedTable = new ResponsiveTable({
	allColumns: ['Name', 'Runs', 'Last run started at', 'Last run status', 'Last run duration', '_Small_LastRunText'],
	mandatoryColumns: ['Name', 'Runs', 'Last run status', 'Last run duration'],
	columnAlignments: {
		'Runs': 'right',
		'Last run duration': 'right',
		Name: 'left',
		'Last run status': 'center',
	},
	hiddenColumns: ['_Small_LastRunText'],
	breakpointOverrides: {
		small: {
			'Last run status': {
				label: 'Last run',
				valueFrom: '_Small_LastRunText',
			},
		},
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
		'_Small_LastRunText',
	],
	mandatoryColumns: ['Name', 'Runs', 'Last run', 'Last run duration'],
	hiddenColumns: ['_Small_LastRunText'],
	columnAlignments: {
		'Builds': 'right',
		'Runs': 'right',
		'Last run duration': 'right',
		Name: 'left',
		'Last run status': 'center',
	},
	breakpointOverrides: {
		small: {
			'Last run': {
				label: 'Last run',
				valueFrom: '_Small_LastRunText',
			},
		},
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
	static override name = 'ls' as const;

	private static readonly INTERNAL_PAGE_SIZE = 100;

	static override description = 'Prints a list of recently executed Actors or Actors you own.';

	static override examples = [
		{
			description: 'List Actors you recently interacted with.',
			command: 'apify actors ls',
		},
		{
			description: 'List Actors you own, newest first.',
			command: 'apify actors ls --my --desc',
		},
		{
			description: 'List the next page of 50 Actors.',
			command: 'apify actors ls --limit 50 --offset 50',
		},
		{
			description: 'List only public Actors.',
			command: 'apify actors ls --public',
		},
		{
			description: 'List only private Actors.',
			command: 'apify actors ls --private',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-actors-ls';

	static override flags = {
		my: Flags.boolean({
			description: 'Whether to list Actors made by the logged in user.',
			default: false,
		}),
		public: Flags.boolean({
			description: 'Show only public Actors.',
			default: false,
			exclusive: ['private'],
		}),
		private: Flags.boolean({
			description: 'Show only private Actors.',
			default: false,
			exclusive: ['public'],
		}),
		offset: Flags.integer({
			description: 'Number of Actors that will be skipped. Defaults to 0.',
		}),
		limit: Flags.integer({
			description: 'Number of Actors that will be listed. Defaults to 20.',
		}),
		desc: Flags.boolean({
			description: 'Sort Actors in descending order.',
			default: false,
		}),
	};

	static override enableJsonFlag = true;

	async run() {
		const { desc, limit, offset, my, json, public: publicOnly, private: privateOnly } = this.flags;

		const client = await getLoggedClientOrThrow();

		let actorItems: HydratedListData[];
		let jsonTotal: number;
		let jsonOffset: number;
		let jsonLimit: number;

		if (publicOnly || privateOnly) {
			const matching: HydratedListData[] = [];
			let pageOffset = 0;
			let total = Infinity;

			while (pageOffset < total) {
				const page = await client
					.actors()
					.list({ desc, my, limit: ActorsLsCommand.INTERNAL_PAGE_SIZE, offset: pageOffset });

				total = page.total;

				if (page.items.length === 0) break;

				const hydrated = await this.hydrateActors(page.items, client);

				for (const item of hydrated) {
					if (publicOnly && item.actor?.isPublic === true) matching.push(item);
					if (privateOnly && item.actor?.isPublic === false) matching.push(item);
				}

				pageOffset += page.items.length;
			}

			const sortedMatching = my ? this.sortByModifiedAt(matching) : this.sortByLastRun(matching);
			jsonTotal = sortedMatching.length;
			jsonOffset = offset ?? 0;
			jsonLimit = limit ?? sortedMatching.length;
			actorItems = sortedMatching.slice(jsonOffset, jsonOffset + jsonLimit);
		} else {
			const rawActorList = await client.actors().list({ limit: limit ?? 20, offset: offset ?? 0, desc, my });

			if (rawActorList.count === 0) {
				if (json) {
					printJsonToStdout(rawActorList);
					return;
				}

				info({
					message: my ? "You don't have any Actors yet!" : 'There are no recent Actors used by you.',
					stdout: true,
				});

				return;
			}

			actorItems = await this.hydrateActors(rawActorList.items, client);
			actorItems = my ? this.sortByModifiedAt(actorItems) : this.sortByLastRun(actorItems);
			jsonTotal = rawActorList.total;
			jsonOffset = rawActorList.offset;
			jsonLimit = limit ?? 20;
		}

		if (actorItems.length === 0) {
			if (json) {
				printJsonToStdout({ items: [], total: jsonTotal, count: 0, offset: jsonOffset, limit: jsonLimit, desc });
				return;
			}

			info({
				message: publicOnly ? 'No public Actors found.' : 'No private Actors found.',
				stdout: true,
			});

			return;
		}

		if (json) {
			printJsonToStdout({
				items: actorItems,
				total: jsonTotal,
				count: actorItems.length,
				offset: jsonOffset,
				limit: jsonLimit,
				desc,
			});
			return;
		}

		const table = my ? myRecentlyUsedTable : recentlyUsedTable;

		const longestActorTitleLength =
			actorItems.reduce((acc: number, curr: HydratedListData) => {
				const title = `${curr.username}/${curr.name}`;

				if (title.length > acc) {
					return title.length;
				}

				return acc;
			}, 0) +
			// Padding left right of the name column
			2 +
			// Runs column minimum size with padding
			6;

		for (const item of actorItems) {
			const lastRunDisplayedTimestamp = item.stats.lastRunStartedAt
				? MultilineTimestampFormatter.display(item.stats.lastRunStartedAt)
				: '';

			const lastRunDuration = item.lastRun
				? (() => {
						if (item.lastRun.finishedAt) {
							return ShortDurationFormatter.format(
								item.lastRun.finishedAt.getTime() - item.lastRun.startedAt.getTime(),
							);
						}

						const duration = Date.now() - item.lastRun.startedAt.getTime();

						return `${ShortDurationFormatter.format(duration)}…`;
					})()
				: '';

			const defaultBuild = item.actor
				? (() => {
						const buildVersionToTag = Object.entries(
							(item.actor.taggedBuilds ?? {}) as Record<string, ActorTaggedBuild>,
						).find(
							([tag, data]) =>
								data.buildNumber === item.actor!.defaultRunOptions.build || tag === item.actor!.defaultRunOptions.build,
						);

						if (buildVersionToTag) {
							return `${chalk.yellow(buildVersionToTag[0])} / ${chalk.cyan(buildVersionToTag[1].buildNumber ?? item.actor.defaultRunOptions.build)}`;
						}

						return chalk.gray('Unknown');
					})()
				: chalk.gray('Unknown');

			const runStatus = (() => {
				if (item.lastRun) {
					const status = prettyPrintStatus(item.lastRun.status);

					const stringParts = [status];

					if (lastRunDuration) {
						stringParts.push(statusMap[item.lastRun.status], chalk.cyan(lastRunDuration));
					}

					if (item.lastRun.finishedAt) {
						const diff = Date.now() - item.lastRun.finishedAt.getTime();

						if (diff < Time.Week) {
							stringParts.push('\n', chalk.gray(`${ShortDurationFormatter.format(diff)} ago`));
						} else {
							stringParts.push('\n', chalk.gray('On', DateOnlyTimestampFormatter.display(item.lastRun.finishedAt)));
						}
					}

					return stringParts.join(' ');
				}

				return '';
			})();

			table.pushRow({
				Name: `${item.title}\n${chalk.gray(`${item.username}/${item.name}`)}`,
				// Completely arbitrary number, but its enough for a very specific edge case where a full actor identifier could be very long, but only on small terminals
				Runs:
					ResponsiveTable.isSmallTerminal() && longestActorTitleLength >= 56
						? kSkipColumn
						: chalk.cyan(`${item.stats?.totalRuns ?? 0}`),
				'Last run started at': lastRunDisplayedTimestamp,
				'Last run': lastRunDisplayedTimestamp,
				'Last run status': item.lastRun ? prettyPrintStatus(item.lastRun.status) : '',
				'Modified at': MultilineTimestampFormatter.display(item.modifiedAt),
				Builds: item.actor ? chalk.cyan(item.actor.stats.totalBuilds) : chalk.gray('Unknown'),
				'Last run duration': ResponsiveTable.isSmallTerminal() ? kSkipColumn : chalk.cyan(lastRunDuration),
				'Default build': defaultBuild,
				_Small_LastRunText: runStatus,
			});
		}

		simpleLog({
			message: table.render(CompactMode.WebLikeCompact),
			stdout: true,
		});
	}

	private async hydrateActors(items: ActorCollectionListItem[], client: ApifyClient): Promise<HydratedListData[]> {
		return Promise.all(
			items.map(async (actorData) => {
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
		);
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
