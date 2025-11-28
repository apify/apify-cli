import type { KeyValueStoreCollectionClient, User } from 'apify-client';
import chalk from 'chalk';

import { getApifyStorageClient } from '../../lib/actor.js';
import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { prettyPrintBytes } from '../../lib/commands/pretty-print-bytes.js';
import { CompactMode, ResponsiveTable } from '../../lib/commands/responsive-table.js';
import { info, simpleLog } from '../../lib/outputs.js';
import { printJsonToStdout, TimestampFormatter } from '../../lib/utils.js';

const table = new ResponsiveTable({
	allColumns: ['Store ID', 'Name', 'Size', 'Created', 'Modified'],
	mandatoryColumns: ['Store ID', 'Name', 'Size'],
});

export class KeyValueStoresLsCommand extends ApifyCommand<typeof KeyValueStoresLsCommand> {
	static override name = 'ls' as const;

	static override description = 'Lists all key-value stores on your account.';

	static override flags = {
		offset: Flags.integer({
			description: 'Number of key-value stores that will be skipped.',
			default: 0,
		}),
		limit: Flags.integer({
			description: 'Number of key-value stores that will be listed.',
			default: 20,
		}),
		desc: Flags.boolean({
			description: 'Sorts key-value stores in descending order.',
			default: false,
		}),
		unnamed: Flags.boolean({
			description: "Lists key-value stores that don't have a name set.",
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
		const keyValueStoreCollectionClient = client.keyValueStores() as KeyValueStoreCollectionClient;
		const rawKvsList = await keyValueStoreCollectionClient.list({ desc, offset, limit, unnamed });

		if (json) {
			printJsonToStdout(rawKvsList);
			return;
		}

		if (rawKvsList.count === 0) {
			info({
				message: "You don't have any key-value stores on your account",
				stdout: true,
			});

			return;
		}

		for (const store of rawKvsList.items) {
			// TODO: update apify-client types
			const statsObject = Reflect.get(store, 'stats') as { s3StorageBytes?: number };
			const size = statsObject.s3StorageBytes;

			const userPart = userInfo ? `${userInfo.username!}/` : '';

			table.pushRow({
				'Store ID': store.id,
				Created: TimestampFormatter.display(store.createdAt),
				Modified: TimestampFormatter.display(store.modifiedAt),
				Name: store.name ? `${userPart}${store.name}` : '',
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
