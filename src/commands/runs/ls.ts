import { Flags } from '@oclif/core';
import { DurationFormatter as SapphireDurationFormatter, TimeTypes } from '@sapphire/duration';
import { Timestamp } from '@sapphire/timestamp';
import chalk from 'chalk';
import Table from 'cli-table';

import { ApifyCommand } from '../../lib/apify_command.js';
import { error, simpleLog } from '../../lib/outputs.js';
import { getLocalConfig, getLocalUserInfo, getLoggedClientOrThrow } from '../../lib/utils.js';

// TODO: remove this once https://github.com/apify/apify-cli/pull/620 is merged
async function resolveActorContext({
	providedActorNameOrId,
	client,
}: { providedActorNameOrId: string | undefined; client: import('apify-client').ApifyClient }) {
	const userInfo = await getLocalUserInfo();
	const usernameOrId = userInfo.username || (userInfo.id as string);
	const localConfig = getLocalConfig(process.cwd()) || {};

	// Full ID
	if (providedActorNameOrId?.includes('/')) {
		const actor = await client.actor(providedActorNameOrId).get();
		if (!actor) {
			return {
				valid: false as const,
				reason: `Actor with ID "${providedActorNameOrId}" was not found`,
			};
		}

		return {
			valid: true as const,
			userFriendlyId: `${actor.username}/${actor.name}`,
			id: actor.id,
		};
	}

	// Try fetching Actor directly by name/id
	if (providedActorNameOrId) {
		const actorById = await client.actor(providedActorNameOrId).get();

		if (actorById) {
			return {
				valid: true as const,
				userFriendlyId: `${actorById.username}/${actorById.name}`,
				id: actorById.id,
			};
		}

		const actorByName = await client.actor(`${usernameOrId}/${providedActorNameOrId.toLowerCase()}`).get();

		if (actorByName) {
			return {
				valid: true as const,
				userFriendlyId: `${actorByName.username}/${actorByName.name}`,
				id: actorByName.id,
			};
		}

		return {
			valid: false as const,
			reason: `Actor with name or ID "${providedActorNameOrId}" was not found`,
		};
	}

	if (localConfig.name) {
		const actor = await client.actor(`${usernameOrId}/${localConfig.name}`).get();

		if (!actor) {
			return {
				valid: false as const,
				reason: `Actor with name "${localConfig.name}" was not found`,
			};
		}

		return {
			valid: true as const,
			userFriendlyId: `${actor.username}/${actor.name}`,
			id: actor.id,
		};
	}

	return {
		valid: false as const,
		reason: 'Unable to detect what Actor to create a build for',
	};
}

function prettyPrintStatus(status: string) {
	switch (status) {
		case 'READY':
			return chalk.green('Ready');
		case 'RUNNING':
			return chalk.blue('Running');
		case 'SUCCEEDED':
			return chalk.green('Succeeded');
		case 'FAILED':
			return chalk.red('Failed');
		case 'ABORTING':
			return chalk.yellow('Aborting');
		case 'ABORTED':
			return chalk.red('Aborted');
		case 'TIMING-OUT':
			return chalk.yellow('Timing Out');
		case 'TIMED-OUT':
			return chalk.red('Timed Out');
		default:
			return chalk.gray(
				(status as string)
					.split('-')
					.map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
					.join(' '),
			);
	}
}

const ShortDurationFormatter = new SapphireDurationFormatter({
	[TimeTypes.Day]: {
		DEFAULT: 'd',
	},
	[TimeTypes.Hour]: {
		DEFAULT: 'h',
	},
	[TimeTypes.Minute]: {
		DEFAULT: 'm',
	},
	[TimeTypes.Month]: {
		DEFAULT: 'M',
	},
	[TimeTypes.Second]: {
		DEFAULT: 's',
	},
	[TimeTypes.Week]: {
		DEFAULT: 'w',
	},
	[TimeTypes.Year]: {
		DEFAULT: 'y',
	},
});

// END of TODO

const multilineTimestampFormatter = new Timestamp(`YYYY-MM-DD[\n]HH:mm:ss`);
const tableFactory = (compact = false) => {
	const options: Record<string, unknown> = {
		head: ['ID', 'Status', 'Results', 'Usage', 'Start Date', 'Took', 'Build Number', 'Origin'],
		style: {
			head: ['cyan', 'cyan', 'cyan', 'cyan', 'cyan', 'cyan', 'cyan', 'cyan'],
			compact,
		},
		colAligns: ['middle', 'middle', 'middle', 'middle', 'middle', 'middle', 'middle', 'middle'],
	};

	if (compact) {
		options.chars = {
			'mid': '',
			'left-mid': '',
			'mid-mid': '',
			'right-mid': '',
			middle: ' ',
			'top-mid': '─',
			'bottom-mid': '─',
		};
	}

	return new Table<[string, string, string, string, string, string, string, string]>(options);
};

export class RunsLsCommand extends ApifyCommand<typeof RunsLsCommand> {
	static override description = 'Lists all runs of the Actor.';

	static override flags = {
		actor: Flags.string({
			description:
				'Optional Actor ID or Name to list runs for. By default, it will use the Actor from the current directory.',
		}),
		offset: Flags.integer({
			description: 'Number of runs that will be skipped.',
			default: 0,
		}),
		limit: Flags.integer({
			description: 'Number of runs that will be listed.',
			default: 10,
		}),
		desc: Flags.boolean({
			description: 'Sort runs in descending order.',
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

		const allRuns = await client.actor(ctx.id).runs().list({ desc, limit, offset });

		if (json) {
			return allRuns;
		}

		if (!allRuns.items.length) {
			simpleLog({
				message: 'There are no recent runs found for this Actor.',
			});

			return;
		}

		const table = tableFactory(compact);

		const message = [
			`${chalk.reset('Showing')} ${chalk.yellow(allRuns.items.length)} out of ${chalk.yellow(allRuns.total)} runs for Actor ${chalk.yellow(ctx.userFriendlyId)} (${chalk.gray(ctx.id)})\n`,
		];

		const datasetInfos = new Map(
			await Promise.all(
				allRuns.items.map(async (run) =>
					client
						.dataset(run.defaultDatasetId)
						.get()
						.then(
							(data) => [run.id, chalk.yellow(data?.itemCount ?? 0)] as const,
							() => [run.id, chalk.gray('N/A')] as const,
						),
				),
			),
		);

		for (const run of allRuns.items) {
			// 'ID', 'Status', 'Results', 'Usage', 'Took', 'Build Number', 'Origin'
			const tableRow: [string, string, string, string, string, string, string, string] = [
				chalk.gray(run.id),
				prettyPrintStatus(run.status),
				chalk.gray('N/A'),
				chalk.cyan(`$${(run.usageTotalUsd ?? 0).toFixed(3)}`),
				multilineTimestampFormatter.display(run.startedAt),
				'',
				run.buildNumber,
				run.meta.origin ?? 'UNKNOWN',
			];

			if (run.finishedAt) {
				const diff = run.finishedAt.getTime() - run.startedAt.getTime();

				tableRow[5] = chalk.gray(`${ShortDurationFormatter.format(diff, undefined, { left: '' })}`);
			} else {
				const diff = Date.now() - run.startedAt.getTime();

				tableRow[5] = chalk.gray(`Running for ${ShortDurationFormatter.format(diff, undefined, { left: '' })}`);
			}

			tableRow[2] = datasetInfos.get(run.id) || chalk.gray('N/A');

			table.push(tableRow);
		}

		message.push(table.toString());

		simpleLog({
			message: message.join('\n'),
		});

		return undefined;
	}
}
