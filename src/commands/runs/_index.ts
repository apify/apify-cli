import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { RunsAbortCommand } from './abort.js';
import { RunsInfoCommand } from './info.js';
import { RunsLogCommand } from './log.js';
import { RunsLsCommand } from './ls.js';
import { RunsResurrectCommand } from './resurrect.js';
import { RunsRmCommand } from './rm.js';

export class RunsIndexCommand extends ApifyCommand<typeof RunsIndexCommand> {
	static override name = 'runs' as const;

	static override description = 'Manages Actor run operations ';

	static override subcommands = [
		RunsAbortCommand,
		RunsInfoCommand,
		RunsLogCommand,
		RunsLsCommand,
		RunsResurrectCommand,
		RunsRmCommand,
	];

	async run() {
		this.printHelp();
	}
}
