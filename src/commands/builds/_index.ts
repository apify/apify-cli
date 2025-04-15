import { BuildsCreateCommand } from './create.js';
import { BuildsInfoCommand } from './info.js';
import { BuildsLogCommand } from './log.js';
import { BuildsLsCommand } from './ls.js';
import { BuildsRmCommand } from './rm.js';
import { ApifyCommand } from '../../lib/command-framework/apify-command.js';

export class BuildsIndexCommand extends ApifyCommand<typeof BuildsIndexCommand> {
	static override name = 'builds' as const;

	static override description = 'Manages Actor build processes and versioning.';

	static override subcommands = [
		//
		BuildsRmCommand,
		BuildsLsCommand,
		BuildsLogCommand,
		BuildsInfoCommand,
		BuildsCreateCommand,
	];

	async run() {
		this.printHelp();
	}
}
