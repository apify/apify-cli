import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import {
	ACTOR_RUNTIME_API_PORT,
	ACTOR_RUNTIME_API_URL,
	ACTOR_RUNTIME_CONSOLE_PORT,
	ACTOR_RUNTIME_CONSOLE_URL,
	CONTAINER_ENGINE_ENV_VAR,
	DOCKER_ENGINE_INSTALL_URL,
	DOCKER_GET_DOCKER_URL,
	PODMAN_INSTALL_URL,
	runtimeEnvExportLines,
} from '../../lib/runtime/docker.js';
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
		'',
		'Prerequisite: Docker or Podman must be installed and running. Follow the official documentation to set one up:',
		'',
		'  Docker Desktop (macOS, Windows, Linux desktop):',
		`    ${DOCKER_GET_DOCKER_URL}`,
		'  Docker Engine (Linux servers, headless):',
		`    ${DOCKER_ENGINE_INSTALL_URL}`,
		'  Podman (rootful or rootless; its API socket must be served, e.g. via the podman.socket systemd unit):',
		`    ${PODMAN_INSTALL_URL}`,
		'',
		`The first engine found on PATH is used, Docker before Podman. Set ${CONTAINER_ENGINE_ENV_VAR}=docker or =podman to choose.`,
		'',
		`'apify runtime install' checks that the engine is available and pulls the runtime image, 'apify runtime start' runs it, and 'apify runtime status' says whether it is up.`,
		'',
		'The runtime publishes two ports on localhost:',
		'',
		`  ${String(ACTOR_RUNTIME_API_PORT).padEnd(5)}  API      ${ACTOR_RUNTIME_API_URL}  (Apify API compatible endpoint)`,
		`  ${String(ACTOR_RUNTIME_CONSOLE_PORT).padEnd(5)}  Console  ${ACTOR_RUNTIME_CONSOLE_URL}  (web UI)`,
		'',
		`Run 'apify runtime connect' to send every Apify CLI command to the runtime instead of the Apify cloud, and 'apify runtime disconnect' to go back. The connection is remembered across terminals and does not touch your login.`,
		'',
		'These environment variables point the CLI (and the Apify SDKs and API clients that honour them) at the runtime for one shell only, and take precedence over the connection wherever they are set:',
		'',
		...runtimeEnvExportLines().map((line) => `  ${line}`),
		'',
		`Unset them to let 'apify runtime connect' decide where commands go.`,
		'',
		`Pointed at the runtime, 'apify push' also registers the pushed directory as the Actor's live dev folder, so runs pick up local edits without another push; 'apify call --no-dev-folder' runs from the built image alone.`,
	].join('\n');

	static override group = 'Local Actor Development';

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
