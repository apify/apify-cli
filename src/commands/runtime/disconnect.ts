import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { info, success, warning } from '../../lib/outputs.js';
import { RUNTIME_EXPERIMENTAL_NOTE } from '../../lib/runtime/docker.js';
import {
	isConnectedToActorRuntime,
	overridingRuntimeEnvVars,
	setConnectedToActorRuntime,
} from '../../lib/runtime/target.js';

export class RuntimeDisconnectCommand extends ApifyCommand<typeof RuntimeDisconnectCommand> {
	static override name = 'disconnect' as const;

	static override description =
		`Disconnects the Apify CLI from the local Actor runtime, so commands go to the Apify platform again. In a shell ` +
		`where APIFY_CLIENT_BASE_URL or APIFY_CONSOLE_URL is set, those still apply.\n` +
		`The runtime keeps running. To stop it, run 'apify runtime stop'.\n\n` +
		RUNTIME_EXPERIMENTAL_NOTE;

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
