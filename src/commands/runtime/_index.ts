import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { ACTOR_RUNTIME_API_URL, ACTOR_RUNTIME_GUIDE_URL, RUNTIME_EXPERIMENTAL_NOTE } from '../../lib/runtime/docker.js';
import { RuntimeConnectCommand } from './connect.js';
import { RuntimeDisconnectCommand } from './disconnect.js';
import { RuntimeInstallCommand } from './install.js';
import { RuntimeSkillCommand } from './skill.js';
import { RuntimeStartCommand } from './start.js';
import { RuntimeStatusCommand } from './status.js';
import { RuntimeStopCommand } from './stop.js';

export class RuntimeIndexCommand extends ApifyCommand<typeof RuntimeIndexCommand> {
	static override name = 'runtime' as const;

	static override description = [
		'Manages the Actor runtime, a self-contained local Apify platform running as a container on Docker or Podman.',
		`For setup and usage, see ${ACTOR_RUNTIME_GUIDE_URL}.`,
		'',
		RUNTIME_EXPERIMENTAL_NOTE,
	].join('\n');

	static override group = 'Local Actor Development';

	static override experimental = true;

	static override examples = [
		{
			description: 'Start the runtime in the background.',
			command: 'apify runtime start --detach',
		},
		{
			description: 'Point the CLI at the runtime and list the Actors it knows about.',
			command: 'apify runtime connect && apify actors ls',
		},
		{
			description: 'Point the CLI at the runtime for a single command instead.',
			command: `APIFY_CLIENT_BASE_URL=${ACTOR_RUNTIME_API_URL} apify actors ls`,
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-runtime';

	static override subcommands = [
		RuntimeInstallCommand,
		RuntimeStartCommand,
		RuntimeStopCommand,
		RuntimeStatusCommand,
		RuntimeConnectCommand,
		RuntimeDisconnectCommand,
		RuntimeSkillCommand,
	];

	async run() {
		this.printHelp();
	}
}
