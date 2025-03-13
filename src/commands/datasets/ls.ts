import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { prettyPrintBytes } from '../../lib/commands/pretty-print-bytes.js';
import { CompactMode, ResponsiveTable } from '../../lib/commands/responsive-table.js';
import { info, simpleLog } from '../../lib/outputs.js';
import { getLocalUserInfo, getLoggedClientOrThrow, printJsonToStdout, TimestampFormatter } from '../../lib/utils.js';

const table = new ResponsiveTable({
	allColumns: ['Dataset ID', 'Name', 'Items', 'Size', 'Created', 'Modified'],
	mandatoryColumns: ['Dataset ID', 'Name', 'Items', 'Size'],
	columnAlignments: {
		Items: 'right',
	},
});

export class DatasetsLsCommand extends ApifyCommand<typeof DatasetsLsCommand> {
	static override name = 'ls';

	static override description = 'Prints all datasets on your account.';

	static override flags = {
		offset: Flags.integer({
			description: 'Number of datasets that will be skipped.',
			default: 0,
		}),
		limit: Flags.integer({
			description: 'Number of datasets that will be listed.',
			default: 20,
		}),
		desc: Flags.boolean({
			description: 'Sorts datasets in descending order.',
			default: false,
		}),
		unnamed: Flags.boolean({
			description: "Lists datasets that don't have a name set.",
			default: false,
		}),
	};

	static override enableJsonFlag = true;

	async run() {
		const { desc, offset, limit, json, unnamed } = this.flags;

		const client = await getLoggedClientOrThrow();
		const user = await getLocalUserInfo();

		const rawDatasetList = await client.datasets().list({ desc, offset, limit, unnamed });

		if (json) {
			printJsonToStdout(rawDatasetList);
			return;
		}

		if (rawDatasetList.count === 0) {
			info({
				message: "You don't have any Datasets on your account",
				stdout: true,
			});

			return;
		}

		for (const dataset of rawDatasetList.items) {
			// TODO: update apify-client types
			const size = Reflect.get(dataset.stats, 's3StorageBytes') as number | undefined;

			table.pushRow({
				'Dataset ID': dataset.id,
				Created: TimestampFormatter.display(dataset.createdAt),
				Items: `${dataset.itemCount}`,
				Modified: TimestampFormatter.display(dataset.modifiedAt),
				Name: dataset.name ? `${user.username!}/${dataset.name}` : '',
				Size:
					typeof size === 'number'
						? prettyPrintBytes({ bytes: size, shortBytes: true, colorFunc: chalk.gray, precision: 0 })
						: chalk.gray('N/A'),
			});
		}

		simpleLog({
			message: table.render(CompactMode.WebLikeCompact),
			stdout: true,
		});
	}
}
