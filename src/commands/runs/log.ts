import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { getLoggedClientOrThrow, outputJobLog } from '../../lib/utils.js';

import { RunsLogCommandMessages } from '#i18n/commands/runs/log.js';

export class RunsLogCommand extends ApifyCommand<typeof RunsLogCommand> {
	static override name = 'log' as const;

	static override description = 'Prints the log of a specific run.';

	static override examples = [
		{
			description: 'Print the log of a specific run to stdout.',
			command: 'apify runs log <runId>',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-runs-log';

	static override args = {
		runId: Args.string({
			required: true,
			description: 'The run ID to get the log from.',
		}),
	};

	async run() {
		const { runId } = this.args;

		const apifyClient = await getLoggedClientOrThrow();

		const run = await apifyClient.run(runId).get();

		if (!run) {
			this.logger.stdout.error(this.t(RunsLogCommandMessages.runNotFound, { runId }));
			return;
		}

		this.logger.stdout.info(this.t(RunsLogCommandMessages.logHeader, { runId }));

		try {
			await outputJobLog({ job: run, apifyClient });
		} catch (err) {
			// This should never happen...
			this.logger.stderr.error(
				this.t(RunsLogCommandMessages.logFetchFailed, { runId, message: (err as Error).message }),
			);
		}
	}
}
