import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { ActorsBuildCommand } from './build.js';
import { ActorsCallCommand } from './call.js';
import { ActorsInfoCommand } from './info.js';
import { ActorsLsCommand } from './ls.js';
import { ActorsPullCommand } from './pull.js';
import { ActorsPushCommand } from './push.js';
import { ActorsRmCommand } from './rm.js';
import { ActorsSearchCommand } from './search.js';
import { ActorsStartCommand } from './start.js';

export class ActorsIndexCommand extends ApifyCommand<typeof ActorsIndexCommand> {
	static override name = 'actors' as const;

	static override description =
		`Search, list, deploy, and call Actors on the Apify platform.\n` +
		`For runtime operations inside a running Actor (push-data, get-input, set-value...), see 'apify actor' (singular).`;

	static override group = 'Apify Console';

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-actors';

	static override subcommands = [
		//
		ActorsStartCommand,
		ActorsRmCommand,
		ActorsSearchCommand,
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
