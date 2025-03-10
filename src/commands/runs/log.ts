import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { error, info } from '../../lib/outputs.js';
import { getLoggedClientOrThrow, outputJobLog } from '../../lib/utils.js';

export class RunsLogCommand extends ApifyCommand<typeof RunsLogCommand> {
	static override name = 'log';

	static override description = 'Prints the log of a specific run.';

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
			error({ message: `Run with ID "${runId}" was not found on your account.`, stdout: true });
			return;
		}

		info({ message: `Log for run with ID "${runId}":\n`, stdout: true });

		try {
			await outputJobLog(run);
		} catch (err) {
			// This should never happen...
			error({ message: `Failed to get log for run with ID "${runId}": ${(err as Error).message}` });
		}
	}
}
