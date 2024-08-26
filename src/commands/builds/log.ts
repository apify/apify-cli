import { Args } from '@oclif/core';

import { ApifyCommand } from '../../lib/apify_command.js';
import { error, info } from '../../lib/outputs.js';
import { getLoggedClientOrThrow, outputJobLog } from '../../lib/utils.js';

export class BuildLogCommand extends ApifyCommand<typeof BuildLogCommand> {
	static override description = 'Prints the log of a specific build';

	static override args = {
		buildId: Args.string({
			required: true,
			description: 'The build id to get the log from',
		}),
	};

	async run() {
		const { buildId } = this.args;

		const apifyClient = await getLoggedClientOrThrow();

		const build = await apifyClient.build(buildId).get();

		if (!build) {
			error({ message: `Build with ID "${buildId}" was not found on your account` });
			return;
		}

		info({ message: `Log for build with ID "${buildId}":\n` });

		try {
			await outputJobLog(build);
		} catch (err) {
			// This should never happen...
			error({ message: `Failed to get log for build with ID "${buildId}": ${(err as Error).message}` });
		}
	}
}
