import { Args } from '@oclif/core';

import { outputRecordFromDefaultStore } from '../../lib/actor.js';
import { ApifyCommand } from '../../lib/apify_command.js';

export class GetValueCommand extends ApifyCommand<typeof GetValueCommand> {
	static override description = 'Gets a value from the default key-value store associated with the Actor run.';

	static override args = {
		key: Args.string({
			required: true,
			description: 'Key of the record in key-value store',
		}),
	};

	async run() {
		const { key } = this.args;

		await outputRecordFromDefaultStore(key);
	}
}
