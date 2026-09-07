import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { RuntimeInstallCommand } from './install.js';
import { RuntimeStartCommand } from './start.js';
import { RuntimeStopCommand } from './stop.js';

export class RuntimeIndexCommand extends ApifyCommand<typeof RuntimeIndexCommand> {
	static override name = 'runtime' as const;

	static override description =
		'Manages the Actor runtime, a self-contained local Apify platform running as a Docker container.';

	static override group = 'Local Actor Development';

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-runtime';

	static override subcommands = [RuntimeInstallCommand, RuntimeStartCommand, RuntimeStopCommand];

	async run() {
		this.printHelp();
	}
}
