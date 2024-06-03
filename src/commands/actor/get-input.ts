import { outputInputFromDefaultStore } from '../../lib/actor.js';
import { ApifyCommand } from '../../lib/apify_command.js';

export class GetInputCommand extends ApifyCommand<typeof GetInputCommand> {
	static override description =
		'Gets the Actor input value from the default key-value store associated with the Actor run.';

	async run() {
		await outputInputFromDefaultStore();
	}
}
