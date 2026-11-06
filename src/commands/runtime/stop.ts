import process from 'node:process';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { execWithLog } from '../../lib/exec.js';
import { info, success, warning } from '../../lib/outputs.js';
import { ACTOR_RUNTIME_CONTAINER_NAME, findRunningRuntimeEngine } from '../../lib/runtime/docker.js';
import { isConnectedToActorRuntime } from '../../lib/runtime/target.js';

export class RuntimeStopCommand extends ApifyCommand<typeof RuntimeStopCommand> {
	static override name = 'stop' as const;

	static override description = `Stops the Actor runtime container started with 'apify runtime start --detach'.`;

	static override group = 'Local Actor Development';

	static override examples = [
		{
			description: 'Stop the running Actor runtime.',
			command: 'apify runtime stop',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-runtime-stop';

	async run() {
		const engine = await findRunningRuntimeEngine();
		if (!engine) {
			info({ message: 'The Actor runtime is not running.' });
			return;
		}

		try {
			await execWithLog({ cmd: engine, args: ['stop', ACTOR_RUNTIME_CONTAINER_NAME] });
		} catch {
			process.exitCode = 1;
			return;
		}

		success({ message: 'The Actor runtime was stopped.' });

		if (isConnectedToActorRuntime()) {
			warning({
				message:
					`The Apify CLI is still connected to the Actor runtime, so commands will fail until you start it again ` +
					`with 'apify runtime start --detach' or run 'apify runtime disconnect'.`,
			});
		}
	}
}
