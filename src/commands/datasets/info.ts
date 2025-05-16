import type { Task } from 'apify-client';
import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { prettyPrintBytes } from '../../lib/commands/pretty-print-bytes.js';
import { CompactMode, ResponsiveTable } from '../../lib/commands/responsive-table.js';
import { getUserPlanPricing } from '../../lib/commands/storage-size.js';
import { tryToGetDataset } from '../../lib/commands/storages.js';
import { error, simpleLog } from '../../lib/outputs.js';
import { getLoggedClientOrThrow, printJsonToStdout, TimestampFormatter } from '../../lib/utils.js';

const consoleLikeTable = new ResponsiveTable({
	allColumns: ['Row1', 'Row2'],
	mandatoryColumns: ['Row1', 'Row2'],
});

export class DatasetsInfoCommand extends ApifyCommand<typeof DatasetsInfoCommand> {
	static override name = 'info' as const;

	static override description = 'Prints information about a specific dataset.';

	static override args = {
		storeId: Args.string({
			description: 'The dataset store ID to print information about.',
			required: true,
		}),
	};

	static override enableJsonFlag = true;

	async run() {
		const { storeId } = this.args;

		const apifyClient = await getLoggedClientOrThrow();
		const maybeStore = await tryToGetDataset(apifyClient, storeId);

		if (!maybeStore) {
			error({
				message: `Key-value store with ID or name "${storeId}" not found.`,
			});

			return;
		}

		const { dataset: info } = maybeStore;

		const [user, actor, run] = await Promise.all([
			apifyClient
				.user(info.userId)
				.get()
				.then((u) => u!),
			info.actId ? apifyClient.actor(info.actId).get() : Promise.resolve(undefined),
			info.actRunId ? apifyClient.run(info.actRunId).get() : Promise.resolve(undefined),
		]);

		let task: Task | undefined;

		if (run?.actorTaskId) {
			task = await apifyClient
				.task(run.actorTaskId)
				.get()
				.catch(() => undefined);
		}

		if (this.flags.json) {
			printJsonToStdout({
				...info,
				user,
				actor: actor || null,
				run: run || null,
				task: task || null,
			});
			return;
		}

		const fullSizeInBytes = info.stats?.storageBytes || 0;
		const readCount = info.stats?.readCount || 0;
		const writeCount = info.stats?.writeCount || 0;
		const cleanCount = (info.cleanItemCount || 0).toLocaleString('en-US');
		const totalCount = (info.itemCount || 0).toLocaleString('en-US');

		const operationsParts = [
			`${chalk.bold(readCount.toLocaleString('en-US'))} ${chalk.gray(this.pluralString(readCount, 'read', 'reads'))}`,
			`${chalk.bold(writeCount.toLocaleString('en-US'))} ${chalk.gray(this.pluralString(writeCount, 'write', 'writes'))}`,
		];

		let row3 = `Items: ${chalk.bold(cleanCount)} ${chalk.gray('clean')} / ${chalk.bold(totalCount)} ${chalk.gray('total')}\nOperations: ${operationsParts.join(' / ')}`;

		if (user.plan) {
			const pricing = getUserPlanPricing(user.plan);

			if (pricing) {
				const storeCostPerHour =
					pricing.KEY_VALUE_STORE_TIMED_STORAGE_GBYTE_HOURS * (fullSizeInBytes / 1000 ** 3);
				const storeCostPerMonth = storeCostPerHour * 24 * 30;

				const usdAmountString =
					storeCostPerMonth > 1 ? `$${storeCostPerMonth.toFixed(2)}` : `$${storeCostPerHour.toFixed(3)}`;

				row3 += `\nStorage size: ${prettyPrintBytes({ bytes: fullSizeInBytes, shortBytes: true, precision: 1 })} / ${chalk.gray(`${usdAmountString} per month`)}`;
			}
		} else {
			row3 += `\nStorage size: ${prettyPrintBytes({ bytes: fullSizeInBytes, shortBytes: true, precision: 1 })}`;
		}

		const row1 = [
			`Dataset ID: ${chalk.bgGray(info.id)}`,
			`Name: ${info.name ? chalk.bgGray(info.name) : chalk.bold(chalk.italic('Unnamed'))}`,
			`Created: ${chalk.bold(TimestampFormatter.display(info.createdAt))}`,
			`Modified: ${chalk.bold(TimestampFormatter.display(info.modifiedAt))}`,
		].join('\n');

		let runInfo = chalk.bold('—');

		if (info.actRunId) {
			if (run) {
				runInfo = chalk.bgBlue(run.id);
			} else {
				runInfo = chalk.italic(chalk.gray('Run removed'));
			}
		}

		let actorInfo = chalk.bold('—');

		if (actor) {
			actorInfo = chalk.blue(actor.title || actor.name);
		}

		let taskInfo = chalk.bold('—');

		if (task) {
			taskInfo = chalk.blue(task.title || task.name);
		}

		const row2 = [`Run: ${runInfo}`, `Actor: ${actorInfo}`, `Task: ${taskInfo}`].join('\n');

		consoleLikeTable.pushRow({
			Row1: row1,
			Row2: row2,
		});

		const rendered = consoleLikeTable.render(CompactMode.NoLines);

		const rows = rendered.split('\n').map((row) => row.trim());

		// Remove the first row
		rows.shift();

		const message = [
			`${chalk.bold(info.name || chalk.italic('Unnamed'))}`,
			`${chalk.gray(info.name ? `${user.username}/${info.name}` : info.id)}  ${chalk.gray('Owned by')} ${chalk.blue(user.username)}`,
			'',
			rows.join('\n'),
			'',
			row3,
		].join('\n');

		simpleLog({ message, stdout: true });
	}
}
