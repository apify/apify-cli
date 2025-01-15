import { Args } from '@oclif/core';

import { ApifyCommand } from '../../lib/apify_command.js';
import { addSecret } from '../../lib/secrets.js';

export class SecretsAddCommand extends ApifyCommand<typeof SecretsAddCommand> {
	static override description = `Adds a new secret to '~/.apify' for use in Actor environment variables.`;

	static override args = {
		name: Args.string({
			required: true,
			description: 'Name of the secret',
		}),
		value: Args.string({
			required: true,
			description: 'Value of the secret',
		}),
	};

	async run() {
		const { name, value } = this.args;

		addSecret(name, value);
	}
}
