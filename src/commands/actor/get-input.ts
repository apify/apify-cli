import { outputInputFromDefaultStore } from '../../lib/actor.js';
import { ApifyCommand } from '../../lib/command-framework/apify-command.js';

export class ActorGetInputCommand extends ApifyCommand<typeof ActorGetInputCommand> {
	static override name = 'get-input' as const;

	static override description =
		'Gets the Actor input value from the default key-value store associated with the Actor run.';

	async run() {
		await outputInputFromDefaultStore();
	}
}
