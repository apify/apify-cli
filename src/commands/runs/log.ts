import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { getLoggedClientOrThrow, outputJobLog } from '../../lib/utils.js';

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
			this.logger.stdout.error(`Run with ID "${runId}" was not found on your account.`);
			return;
		}

		this.logger.stdout.info(`Log for run with ID "${runId}":\n`);

		try {
			await outputJobLog({ job: run, apifyClient });
		} catch (err) {
			// This should never happen...
			this.logger.stderr.error(`Failed to get log for run with ID "${runId}": ${(err as Error).message}`);
		}
	}
}
