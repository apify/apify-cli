import { ActorsBuildCommand } from './build.js';
import { ActorsCallCommand } from './call.js';
import { ActorsInfoCommand } from './info.js';
import { ActorsLsCommand } from './ls.js';
import { ActorsPullCommand } from './pull.js';
import { ActorsPushCommand } from './push.js';
import { ActorsRmCommand } from './rm.js';
import { ActorsStartCommand } from './start.js';
import { ApifyCommand } from '../../lib/command-framework/apify-command.js';

export class ActorsIndexCommand extends ApifyCommand<typeof ActorsIndexCommand> {
	static override name = 'actors' as const;

	static override description = 'Manages Actor creation, deployment, and execution on the Apify platform.';

	static override subcommands = [
		//
		ActorsStartCommand,
		ActorsRmCommand,
		ActorsPushCommand,
		ActorsPullCommand,
		ActorsLsCommand,
		ActorsInfoCommand,
		ActorsCallCommand,
		ActorsBuildCommand,
	];

	async run() {
		this.printHelp();
	}
}
