import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { error, info } from '../../lib/outputs.js';
import { getLoggedClientOrThrow, outputJobLog } from '../../lib/utils.js';

export class BuildsLogCommand extends ApifyCommand<typeof BuildsLogCommand> {
	static override name = 'log' as const;

	static override description = 'Prints the log of a specific build.';

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
			error({ message: `Build with ID "${buildId}" was not found on your account.`, stdout: true });
			return;
		}

		info({ message: `Log for build with ID "${buildId}":\n` });

		try {
			await outputJobLog({ job: build, apifyClient });
		} catch (err) {
			// This should never happen...
			error({
				message: `Failed to get log for build with ID "${buildId}": ${(err as Error).message}`,
				stdout: true,
			});
		}
	}
}
