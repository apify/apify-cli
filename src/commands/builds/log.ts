import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { info } from '../../lib/outputs.js';
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
			throw new Error(`Build with ID "${buildId}" was not found on your account.`);
		}

		info({ message: `Log for build with ID "${buildId}":\n` });

		await outputJobLog({ job: build, apifyClient });
	}
}
