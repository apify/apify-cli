import { BuildsLogCommandMessages } from '#i18n/commands/builds/log.js';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { getLoggedClientOrThrow, outputJobLog } from '../../lib/utils.js';

export class BuildsLogCommand extends ApifyCommand<typeof BuildsLogCommand> {
	static override name = 'log' as const;

	static override description = 'Prints the log of a specific build.';

	static override examples = [
		{
			description: 'Print the build log.',
			command: 'apify builds log <buildId>',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-builds-log';

	static override args = {
		buildId: Args.string({
			required: true,
			description: 'The build ID to get the log from.',
		}),
	};

	async run() {
		const { buildId } = this.args;

		const apifyClient = await getLoggedClientOrThrow();

		const build = await apifyClient.build(buildId).get();

		if (!build) {
			throw new Error(this.t(BuildsLogCommandMessages.buildNotFound, { buildId }));
		}

		this.logger.stderr.info(this.t(BuildsLogCommandMessages.logHeader, { buildId }));

		try {
			await outputJobLog({ job: build, apifyClient });
		} catch (err) {
			// This should never happen...
			this.logger.stdout.error(
				this.t(BuildsLogCommandMessages.logFailed, { buildId, message: (err as Error).message }),
			);
		}
	}
}
