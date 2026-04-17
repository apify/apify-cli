import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { BuildsAddTagCommand } from './add-tag.js';
import { BuildsCreateCommand } from './create.js';
import { BuildsInfoCommand } from './info.js';
import { BuildsLogCommand } from './log.js';
import { BuildsLsCommand } from './ls.js';
import { BuildsRemoveTagCommand } from './remove-tag.js';
import { BuildsRmCommand } from './rm.js';

export class BuildsIndexCommand extends ApifyCommand<typeof BuildsIndexCommand> {
	static override name = 'builds' as const;

	static override description =
		'Inspect, tag, and delete Actor builds on the Apify platform. Also supports starting a new build.';

	static override group = 'Apify Console';

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-builds';

	static override subcommands = [
		//
		BuildsAddTagCommand,
		BuildsRemoveTagCommand,
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
