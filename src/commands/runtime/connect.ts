import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { simpleLog, success, warning } from '../../lib/outputs.js';
import {
	ACTOR_RUNTIME_API_URL,
	ACTOR_RUNTIME_CONSOLE_URL,
	findRunningRuntimeEngine,
} from '../../lib/runtime/docker.js';
import { overridingRuntimeEnvVars, setConnectedToActorRuntime } from '../../lib/runtime/target.js';

export class RuntimeConnectCommand extends ApifyCommand<typeof RuntimeConnectCommand> {
	static override name = 'connect' as const;

	static override description =
		`Points the Apify CLI at the local Actor runtime instead of the Apify platform, for every command from now on ` +
		`and in every terminal.\n` +
		`The API and console URL environment variables keep taking precedence where they are set, so a shell that ` +
		`exports them is unaffected. Your login is untouched - run 'apify runtime disconnect' to target the Apify ` +
		`platform again.`;

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

		success({ message: 'The Apify CLI now targets the local Actor runtime.' });
		simpleLog({
			message: [
				`  API:     ${ACTOR_RUNTIME_API_URL}`,
				`  Console: ${ACTOR_RUNTIME_CONSOLE_URL}`,
				'',
				`Run ${chalk.white.bold('apify runtime disconnect')} to target the Apify platform again.`,
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
