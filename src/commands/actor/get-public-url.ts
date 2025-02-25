import { ACTOR_ENV_VARS, APIFY_ENV_VARS } from '@apify/consts';
import { Args } from '@oclif/core';

import { ApifyCommand } from '../../lib/apify_command.js';

export class GetPublicUrlCommand extends ApifyCommand<typeof GetPublicUrlCommand> {
	static override description = 'Get an HTTP URL that allows public access to a key-value store item.';

	static override args = {
		key: Args.string({
			required: true,
			description: 'Key of the record in key-value store',
		}),
	};

	async run() {
		const { key } = this.args;

		const apiBase = process.env[APIFY_ENV_VARS.API_PUBLIC_BASE_URL];
		const storeId = process.env[ACTOR_ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID];

		console.log(`${apiBase}/v2/key-value-stores/${storeId}/records/${key}`);
	}
}
