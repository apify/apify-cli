import { KeyValueStoresCreateCommand } from './create.js';
import { KeyValueStoresDeleteValueCommand } from './delete-value.js';
import { KeyValueStoresGetValueCommand } from './get-value.js';
import { KeyValueStoresInfoCommand } from './info.js';
import { KeyValueStoresKeysCommand } from './keys.js';
import { KeyValueStoresLsCommand } from './ls.js';
import { KeyValueStoresRenameCommand } from './rename.js';
import { KeyValueStoresRmCommand } from './rm.js';
import { KeyValueStoresSetValueCommand } from './set-value.js';
import { ApifyCommand } from '../../lib/command-framework/apify-command.js';

export class KeyValueStoresIndexCommand extends ApifyCommand<typeof KeyValueStoresIndexCommand> {
	static override name = 'key-value-stores';

	static override description = 'Manages persistent key-value storage.\n\nAlias: kvs';

	static override hiddenAliases = ['kvs'];

	static override subcommands = [
		KeyValueStoresCreateCommand,
		KeyValueStoresDeleteValueCommand,
		KeyValueStoresGetValueCommand,
		KeyValueStoresInfoCommand,
		KeyValueStoresKeysCommand,
		KeyValueStoresLsCommand,
		KeyValueStoresRenameCommand,
		KeyValueStoresRmCommand,
		KeyValueStoresSetValueCommand,
	];

	async run() {
		this.printHelp();
	}
}
