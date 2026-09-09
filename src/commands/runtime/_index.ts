import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import {
	ACTOR_RUNTIME_API_PORT,
	ACTOR_RUNTIME_API_URL,
	ACTOR_RUNTIME_CONSOLE_PORT,
	ACTOR_RUNTIME_CONSOLE_URL,
	DOCKER_ENGINE_INSTALL_URL,
	DOCKER_GET_DOCKER_URL,
	runtimeEnvExportLines,
} from '../../lib/runtime/docker.js';
import { RuntimeInstallCommand } from './install.js';
import { RuntimeStartCommand } from './start.js';
import { RuntimeStopCommand } from './stop.js';

export class RuntimeIndexCommand extends ApifyCommand<typeof RuntimeIndexCommand> {
	static override name = 'runtime' as const;

	static override description = [
		'Manages the Actor runtime, a self-contained local Apify platform running as a Docker container.',
		'',
		'Prerequisite: Docker must be installed and running. Follow the official Docker documentation to set it up:',
		'',
		'  Docker Desktop (macOS, Windows, Linux desktop):',
		`    ${DOCKER_GET_DOCKER_URL}`,
		'  Docker Engine (Linux servers, headless):',
		`    ${DOCKER_ENGINE_INSTALL_URL}`,
		'',
		`'apify runtime install' checks that Docker is available and pulls the runtime image.`,
		'',
		'The runtime publishes two ports on localhost:',
		'',
		`  ${String(ACTOR_RUNTIME_API_PORT).padEnd(5)}  API      ${ACTOR_RUNTIME_API_URL}  (Apify API compatible endpoint)`,
		`  ${String(ACTOR_RUNTIME_CONSOLE_PORT).padEnd(5)}  Console  ${ACTOR_RUNTIME_CONSOLE_URL}  (web UI)`,
		'',
		'Point the Apify CLI (and Apify SDKs and API clients that honour these variables) at the runtime instead of the Apify cloud by setting:',
		'',
		...runtimeEnvExportLines().map((line) => `  ${line}`),
		'',
		`Unset them to talk to the Apify cloud again. 'apify runtime start' prints the same values when the runtime boots.`,
		'',
		`With the CLI pointed at the runtime, 'apify push' also registers the pushed directory as the Actor's live dev folder: later runs mount it over the built image, so local edits (recompiled locally) apply on the next 'apify call' without another push.`,
		`Pass --no-dev-folder to 'apify call' to run from the built image alone, or to 'apify push' to clear the registration.`,
	].join('\n');

	static override group = 'Local Actor Development';

	static override examples = [
		{
			description: 'Start the runtime in the background.',
			command: 'apify runtime start --detach',
		},
		{
			description: 'Point the CLI at the runtime and list Actors it knows about.',
			command: `APIFY_CLIENT_BASE_URL=${ACTOR_RUNTIME_API_URL} apify actors ls`,
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-runtime';

	static override subcommands = [RuntimeInstallCommand, RuntimeStartCommand, RuntimeStopCommand];

	async run() {
		this.printHelp();
	}
}
