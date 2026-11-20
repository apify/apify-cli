import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { simpleLog, success, warning } from '../../lib/outputs.js';
import {
	findRunningRuntimeEngine,
	runtimeApiUrl,
	runtimeConsoleUrl,
	RUNTIME_EXPERIMENTAL_NOTE,
	runtimeSkillHintLines,
} from '../../lib/runtime/docker.js';
import {
	configuredRuntimePorts,
	overridingRuntimeEnvVars,
	setConnectedToActorRuntime,
} from '../../lib/runtime/target.js';

export class RuntimeConnectCommand extends ApifyCommand<typeof RuntimeConnectCommand> {
	static override name = 'connect' as const;

	static override description =
		`Sends all Apify CLI commands to the local Actor runtime instead of the Apify platform. Applies in every ` +
		`terminal until you run 'apify runtime disconnect'. Your login stays the same.\n` +
		`In a shell where APIFY_CLIENT_BASE_URL or APIFY_CONSOLE_URL is set, those variables override this setting.\n\n` +
		RUNTIME_EXPERIMENTAL_NOTE;

	static override group = 'Local Actor Development';

	static override examples = [
		{
			description: 'Send every Apify CLI command to the local Actor runtime.',
			command: 'apify runtime connect',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-runtime-connect';

	async run() {
		setConnectedToActorRuntime(true);
		const ports = configuredRuntimePorts();

		success({ message: 'The Apify CLI now targets the local Actor runtime.' });
		simpleLog({
			message: [
				`  API:     ${runtimeApiUrl(ports.api)}`,
				`  Console: ${runtimeConsoleUrl(ports.console)}`,
				'',
				`Run ${chalk.white.bold('apify runtime disconnect')} to target the Apify platform again.`,
				'',
				...runtimeSkillHintLines(),
			].join('\n'),
		});

		const overrides = overridingRuntimeEnvVars();
		if (overrides.length) {
			warning({
				message: [
					'These environment variables are set in this shell and take precedence over the connection:',
					...overrides.map(([name, value]) => `  ${name}=${value}`),
					'Unset them to let the connection decide where commands go.',
				].join('\n'),
			});
		}

		if (!(await findRunningRuntimeEngine())) {
			warning({
				message: `The Actor runtime is not running - commands will fail until you start it with ${chalk.white.bold('apify runtime start --detach')}.`,
			});
		}
	}
}
