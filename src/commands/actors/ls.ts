import { Time } from '@sapphire/duration';
import type { Actor, ActorRunListItem, ActorTaggedBuild, PaginatedList } from 'apify-client';
import chalk from 'chalk';

import type { ACTOR_JOB_STATUSES } from '@apify/consts';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { prettyPrintStatus } from '../../lib/commands/pretty-print-status.js';
import { CompactMode, kSkipColumn, ResponsiveTable } from '../../lib/commands/responsive-table.js';
import { info, simpleLog } from '../../lib/outputs.js';
import {
	DateOnlyTimestampFormatter,
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

	static override description = 'Prints a list of recently executed Actors or Actors you own.';

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

	static override requiresAuthentication = 'always' as const;

	async run() {
		const { desc, limit, offset, my, json } = this.flags;

		const rawActorList = await this.apifyClient.actors().list({ limit, offset, desc, my });

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

		// Fetch the last run for actors
		const actorList: PaginatedList<HydratedListData> = {
			...rawActorList,
			items: await Promise.all(
				rawActorList.items.map(async (actorData) => {
					const actor = await this.apifyClient.actor(actorData.id).get();
					const runs = await this.apifyClient
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
			printJsonToStdout(actorList);
			return;
		}

		const table = my ? myRecentlyUsedTable : recentlyUsedTable;

		const longestActorTitleLength =
			actorList.items.reduce((acc, curr) => {
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

		for (const item of actorList.items) {
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
								data.buildNumber === item.actor!.defaultRunOptions.build ||
								tag === item.actor!.defaultRunOptions.build,
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
							stringParts.push(
								'\n',
								chalk.gray('On', DateOnlyTimestampFormatter.display(item.lastRun.finishedAt)),
							);
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
