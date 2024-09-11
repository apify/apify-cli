import { Flags } from '@oclif/core';
import { Timestamp } from '@sapphire/timestamp';
import chalk from 'chalk';

import { ApifyCommand } from '../../lib/apify_command.js';
import { prettyPrintStatus } from '../../lib/commands/pretty-print-status.js';
import { resolveActorContext } from '../../lib/commands/resolve-actor-context.js';
import { ResponsiveTable } from '../../lib/commands/responsive-table.js';
import { error, simpleLog } from '../../lib/outputs.js';
import { getLoggedClientOrThrow, ShortDurationFormatter } from '../../lib/utils.js';

const multilineTimestampFormatter = new Timestamp(`YYYY-MM-DD[\n]HH:mm:ss`);

const table = new ResponsiveTable({
	allColumns: ['ID', 'Status', 'Results', 'Usage', 'Started At', 'Took', 'Build No.', 'Origin'],
	mandatoryColumns: ['ID', 'Status', 'Results', 'Usage', 'Started At', 'Took'],
	columnAlignments: {
		Results: 'right',
		Usage: 'right',
		Took: 'right',
		'Build No.': 'right',
	},
});

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

		// Should we allow users to list any runs, not just actor-specific runs? Right now it works like `builds ls`, requiring an actor
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

		const message = [
			`${chalk.reset('Showing')} ${chalk.yellow(allRuns.items.length)} out of ${chalk.yellow(allRuns.total)} runs for Actor ${chalk.yellow(ctx.userFriendlyId)} (${chalk.gray(ctx.id)})`,
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
			let tookString: string;

			if (run.finishedAt) {
				const diff = run.finishedAt.getTime() - run.startedAt.getTime();

				tookString = chalk.gray(`${ShortDurationFormatter.format(diff, undefined, { left: '' })}`);
			} else {
				const diff = Date.now() - run.startedAt.getTime();

				tookString = chalk.gray(`Running for ${ShortDurationFormatter.format(diff, undefined, { left: '' })}`);
			}

			table.pushRow({
				ID: chalk.gray(run.id),
				Status: prettyPrintStatus(run.status),
				Results: datasetInfos.get(run.id) || chalk.gray('N/A'),
				Usage: chalk.cyan(`$${(run.usageTotalUsd ?? 0).toFixed(3)}`),
				'Started At': multilineTimestampFormatter.display(run.startedAt),
				Took: tookString,
				'Build No.': run.buildNumber,
				Origin: run.meta.origin ?? 'UNKNOWN',
			});
		}

		message.push(table.render(compact));

		simpleLog({
			message: message.join('\n'),
		});

		return undefined;
	}
}