import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { simpleLog, success } from '../../lib/outputs.js';
import { ACTOR_RUNTIME_IMAGE } from '../../lib/runtime/docker.js';
import { ensureActorRuntimeImage } from '../../lib/runtime/ensure.js';

export class RuntimeInstallCommand extends ApifyCommand<typeof RuntimeInstallCommand> {
	static override name = 'install' as const;

	static override description = `Installs the Actor runtime: verifies this machine can run Docker images and downloads the Actor runtime Docker image ('${ACTOR_RUNTIME_IMAGE}').`;

	static override group = 'Local Actor Development';

	static override examples = [
		{
			description: 'Install the Actor runtime.',
			command: 'apify runtime install',
		},
		{
			description: 'Re-download the Actor runtime image even if it is already present.',
			command: 'apify runtime install --force',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-runtime-install';

	static override flags = {
		force: Flags.boolean({
			char: 'f',
			description: 'Download the Actor runtime image even when it is already available locally.',
			default: false,
		}),
	};

	async run() {
		const installed = await ensureActorRuntimeImage({ forcePull: this.flags.force });
		if (!installed) return;

		success({ message: 'Actor runtime is installed.' });
		simpleLog({ message: `Start it with 'apify runtime start'.` });
	}
}
