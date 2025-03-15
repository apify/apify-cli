import { ACTOR_ENV_VARS, APIFY_ENV_VARS } from '@apify/consts';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { CommandExitCodes } from '../../lib/consts.js';
import { error } from '../../lib/outputs.js';

export class ActorGetPublicUrlCommand extends ApifyCommand<typeof ActorGetPublicUrlCommand> {
	static override name = 'get-public-url';

	static override description = 'Get an HTTP URL that allows public access to a key-value store item.';

	static override args = {
		key: Args.string({
			required: true,
			description: 'Key of the record in key-value store',
		}),
	};

	async run() {
		const { key } = this.args;

		if ([undefined, 'false', ''].includes(process.env[APIFY_ENV_VARS.IS_AT_HOME])) {
			error({ message: 'get-public-url is not yet implemented for local development' });
			process.exitCode = CommandExitCodes.NotImplemented;
			return;
		}

		const apiBase = process.env[APIFY_ENV_VARS.API_PUBLIC_BASE_URL];
		const storeId = process.env[ACTOR_ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID];

		console.log(`${apiBase}/v2/key-value-stores/${storeId}/records/${key}`);
	}
}
