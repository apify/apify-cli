import { Flags } from '../command-framework/flags.js';
import { LOCAL_CONFIG_PATH } from '../consts.js';

/** The flags that pick the Actor and version for every `apify env` command that calls the API. */
export const envTargetFlags = {
	dir: Flags.string({
		description:
			'Directory of the Actor and its .env file. Use it to pick an Actor folder in a monorepo. Defaults to the current directory.',
		required: false,
	}),
	actor: Flags.string({
		description: 'ID or "username/name" of the Actor. Use it to target an Actor without a local project.',
		required: false,
	}),
	version: Flags.string({
		char: 'v',
		description: `Actor version. Defaults to "version" in '${LOCAL_CONFIG_PATH}', then to 0.0.`,
		required: false,
	}),
};
