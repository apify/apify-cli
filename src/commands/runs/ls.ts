import { Flags } from '@oclif/core';
import { Timestamp } from '@sapphire/timestamp';
import chalk from 'chalk';
import Table from 'cli-table';

import { ApifyCommand } from '../../lib/apify_command.js';
import { prettyPrintStatus } from '../../lib/commands/pretty-print-status.js';
import { resolveActorContext } from '../../lib/commands/resolve-actor-context.js';
import { error, simpleLog } from '../../lib/outputs.js';
import { getLoggedClientOrThrow, ShortDurationFormatter } from '../../lib/utils.js';

const multilineTimestampFormatter = new Timestamp(`YYYY-MM-DD[\n]HH:mm:ss`);
const terminalColumns = process.stdout.columns ?? 100;
const tableFactory = (compact = false) => {
	const head =
		terminalColumns < 100
			? // Smaller terminals should show less data
				['ID', 'Status', 'Results', 'Usage', 'Started At', 'Took']
			: ['ID', 'Status', 'Results', 'Usage', 'Started At', 'Took', 'Build No.', 'Origin'];

	const options: Record<string, unknown> = {
		head,
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

	return new Table<
		// Small terminal (drop origin and build number)
		| [string, string, string, string, string, string]
		// large enough terminal
		| [string, string, string, string, string, string, string, string]
	>(options);
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
			const tableRow:
				| [string, string, string, string, string, string]
				| [string, string, string, string, string, string, string, string] = [
				chalk.gray(run.id),
				prettyPrintStatus(run.status),
				chalk.gray('N/A'),
				chalk.cyan(`$${(run.usageTotalUsd ?? 0).toFixed(3)}`),
				multilineTimestampFormatter.display(run.startedAt),
				'',
			];

			if (run.finishedAt) {
				const diff = run.finishedAt.getTime() - run.startedAt.getTime();

				tableRow[5] = chalk.gray(`${ShortDurationFormatter.format(diff, undefined, { left: '' })}`);
			} else {
				const diff = Date.now() - run.startedAt.getTime();

				tableRow[5] = chalk.gray(`Running for ${ShortDurationFormatter.format(diff, undefined, { left: '' })}`);
			}

			tableRow[2] = datasetInfos.get(run.id) || chalk.gray('N/A');

			if (terminalColumns >= 100) {
				tableRow.push(run.buildNumber, run.meta.origin ?? 'UNKNOWN');
			}

			table.push(tableRow);
		}

		message.push(table.toString());

		simpleLog({
			message: message.join('\n'),
		});

		return undefined;
	}
}
