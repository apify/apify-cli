import type { DatasetCollectionClient, User } from 'apify-client';
import chalk from 'chalk';

import { getApifyStorageClient } from '../../lib/actor.js';
import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { prettyPrintBytes } from '../../lib/commands/pretty-print-bytes.js';
import { CompactMode, ResponsiveTable } from '../../lib/commands/responsive-table.js';
import { info, simpleLog } from '../../lib/outputs.js';
import { printJsonToStdout, TimestampFormatter } from '../../lib/utils.js';

const table = new ResponsiveTable({
	allColumns: ['Dataset ID', 'Name', 'Items', 'Size', 'Created', 'Modified'],
	mandatoryColumns: ['Dataset ID', 'Name', 'Items', 'Size'],
	columnAlignments: {
		Items: 'right',
	},
});

export class DatasetsLsCommand extends ApifyCommand<typeof DatasetsLsCommand> {
	static override name = 'ls' as const;

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

	static override requiresAuthentication = 'optionally' as const;

	async run() {
		const { desc, offset, limit, json, unnamed } = this.flags;

		const client = await getApifyStorageClient(this.apifyClient);

		let userInfo: User | undefined;
		if (this.apifyClient) {
			userInfo = await this.apifyClient.user('me').get();
		}

		// this type cast is unfortunately needed - the generic client from Crawlee doesn't take
		// any options (and they will be rightfully ignored for local storage client)
		const datasetCollectionClient = client.datasets() as DatasetCollectionClient;
		const rawDatasetList = await datasetCollectionClient.list({ desc, offset, limit, unnamed });

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

			const userPart = userInfo ? `${userInfo.username!}/` : '';

			table.pushRow({
				'Dataset ID': dataset.id,
				Created: TimestampFormatter.display(dataset.createdAt),
				Items: `${dataset.itemCount}`,
				Modified: TimestampFormatter.display(dataset.modifiedAt),
				Name: dataset.name ? `${userPart}${dataset.name}` : '',
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
