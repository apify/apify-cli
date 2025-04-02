import { Args } from '@oclif/core';

import { ACTOR_ENV_VARS, APIFY_ENV_VARS } from '@apify/consts';
import { createHmacSignature } from '@apify/utilities';

import { getApifyStorageClient } from '../../lib/actor.js';
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

		// This should never happen, but handle it gracefully to prevent crashes.
		if (!storeId) {
			error({
				message: `Missing environment variable: ${ACTOR_ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID}. Please set it before running the command.`,
			});
			process.exitCode = CommandExitCodes.InvalidInput;
			return;
		}

		const apifyClient = await getApifyStorageClient();
		const store = await apifyClient.keyValueStore(storeId).get();

		const publicUrl = new URL(`${apiBase}/v2/key-value-stores/${storeId}/records/${key}`);

		if (!store) {
			error({
				message: `Key-Value store with ID '${storeId}' was not found. Ensure the store exists and that the correct ID is set in ${ACTOR_ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID}.`,
			});
			process.exitCode = CommandExitCodes.NotFound;
			return;
		}

		// @ts-expect-error Add types to client
		const { urlSigningSecretKey } = store;

		if (urlSigningSecretKey) {
			publicUrl.searchParams.append('signature', createHmacSignature(urlSigningSecretKey as string, key));
		}

		console.log(publicUrl.toString());
	}
}
