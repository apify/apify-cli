import { outputRecordFromDefaultStore } from '../../lib/actor.js';
import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';

export class ActorGetValueCommand extends ApifyCommand<typeof ActorGetValueCommand> {
	static override name = 'get-value' as const;

	static override description = 'Gets a value from the default key-value store associated with the Actor run.';

	static override group = 'Actor Runtime';

	static override examples = [
		{
			description: 'Read the record stored under the key "INPUT".',
			command: 'actor get-value INPUT',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#actor-get-value';

	static override args = {
		key: Args.string({
			required: true,
			description: 'Key of the record in the key-value store.',
		}),
	};

	async run() {
		const { key } = this.args;

		await outputRecordFromDefaultStore(key);
	}
}
