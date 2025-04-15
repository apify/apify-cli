import { ActorChargeCommand } from './charge.js';
import { ActorGetInputCommand } from './get-input.js';
import { ActorGetPublicUrlCommand } from './get-public-url.js';
import { ActorGetValueCommand } from './get-value.js';
import { ActorPushDataCommand } from './push-data.js';
import { ActorSetValueCommand } from './set-value.js';
import { ApifyCommand } from '../../lib/command-framework/apify-command.js';

export class ActorIndexCommand extends ApifyCommand<typeof ActorIndexCommand> {
	static override name = 'actor' as const;

	static override description = 'Manages runtime data operations inside of a running Actor.';

	static override subcommands = [
		//
		ActorSetValueCommand,
		ActorPushDataCommand,
		ActorGetValueCommand,
		ActorGetPublicUrlCommand,
		ActorGetInputCommand,
		ActorChargeCommand,
	];

	async run() {
		this.printHelp();
	}
}
