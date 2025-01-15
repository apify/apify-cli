import { Args } from '@oclif/core';

import { ApifyCommand } from '../../lib/apify_command.js';
import { removeSecret } from '../../lib/secrets.js';

export class SecretRmCommand extends ApifyCommand<typeof SecretRmCommand> {
	static override description = 'Permanently deletes a secret from your stored credentials.';

	static override args = {
		name: Args.string({
			required: true,
			description: 'Name of the secret',
		}),
	};

	async run() {
		const { name } = this.args;

		removeSecret(name);
	}
}
