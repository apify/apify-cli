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

	static override description = 'Manages structured data storage and retrieval.';

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
