import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { info, success, warning } from '../../lib/outputs.js';
import {
	isConnectedToActorRuntime,
	overridingRuntimeEnvVars,
	setConnectedToActorRuntime,
} from '../../lib/runtime/target.js';

export class RuntimeDisconnectCommand extends ApifyCommand<typeof RuntimeDisconnectCommand> {
	static override name = 'disconnect' as const;

	static override description =
		`Reverts 'apify runtime connect': the Apify CLI targets the Apify platform again, unless the API and console URL ` +
		`environment variables point it somewhere else.\n` +
		`The runtime itself keeps running - stop it with 'apify runtime stop'.`;

	static override group = 'Local Actor Development';

	static override examples = [
		{
			description: 'Send Apify CLI commands to the Apify platform again.',
			command: 'apify runtime disconnect',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-runtime-disconnect';

	async run() {
		const wasConnected = isConnectedToActorRuntime();
		setConnectedToActorRuntime(false);

		if (wasConnected) {
			success({ message: 'The Apify CLI no longer targets the local Actor runtime.' });
		} else {
			info({ message: 'The Apify CLI was not connected to the local Actor runtime.' });
		}

		const overrides = overridingRuntimeEnvVars();
		if (overrides.length) {
			warning({
				message: [
					'These environment variables are still set in this shell and keep pointing the CLI away from the Apify platform:',
					...overrides.map(([name, value]) => `  ${name}=${value}`),
					'Unset them to talk to the Apify platform.',
				].join('\n'),
			});
		}
	}
}
