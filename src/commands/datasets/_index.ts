import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { DatasetsCreateCommand } from './create.js';
import { DatasetsGetItems } from './get-items.js';
import { DatasetsInfoCommand } from './info.js';
import { DatasetsLsCommand } from './ls.js';
import { DatasetsPushDataCommand } from './push-items.js';
import { DatasetsRenameCommand } from './rename.js';
import { DatasetsRmCommand } from './rm.js';

export class DatasetsIndexCommand extends ApifyCommand<typeof DatasetsIndexCommand> {
	static override name = 'datasets' as const;

	static override description =
		'Manage Apify datasets — create, list, rename, delete, push items, and download items in various formats.';

	static override group = 'Apify Console';

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-datasets';

	static override subcommands = [
		DatasetsCreateCommand,
		DatasetsGetItems,
		DatasetsLsCommand,
		DatasetsInfoCommand,
		DatasetsRmCommand,
		DatasetsRenameCommand,
		DatasetsPushDataCommand,
	];

	async run() {
		this.printHelp();
	}
}
