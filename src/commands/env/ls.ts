import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { envTargetFlags } from '../../lib/env-vars/flags.js';
import { describeTarget, renderEnvVarTable, targetJson } from '../../lib/env-vars/output.js';
import { listPlatformEnvVars } from '../../lib/env-vars/platform.js';
import { resolveEnvTarget } from '../../lib/env-vars/target.js';
import { info, simpleLog } from '../../lib/outputs.js';
import { printJsonToStdout } from '../../lib/utils.js';

export class EnvLsCommand extends ApifyCommand<typeof EnvLsCommand> {
	static override name = 'ls' as const;

	static override description =
		'Lists the env vars of an Actor version on the Apify platform. Secret values stay hidden.';

	static override examples = [
		{
			description: 'List the env vars of the Actor in the current directory.',
			command: 'apify env ls',
		},
		{
			description: 'List the env vars of version 1.0 of an Actor without a local project.',
			command: 'apify env ls --actor username/my-actor --version 1.0',
		},
		{
			description: 'List the env vars of an Actor in a monorepo folder as JSON.',
			command: 'apify env ls --dir actors/scraper --json',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-env-ls';

	static override enableJsonFlag = true;

	static override enableProfileFlag = true;

	static override flags = {
		...envTargetFlags,
	};

	async run() {
		const target = await resolveEnvTarget(this.flags);
		const envVars = await listPlatformEnvVars(target);

		if (this.flags.json) {
			printJsonToStdout({
				ok: true,
				operation: 'env-ls',
				...targetJson(target),
				envVars: envVars.map(({ name, isSecret, value }) =>
					isSecret ? { name, isSecret } : { name, isSecret, value },
				),
			});
			return;
		}

		if (!envVars.length) {
			info({ message: `No env vars on ${describeTarget(target)}.`, stdout: true });
			return;
		}

		simpleLog({ message: renderEnvVarTable(envVars), stdout: true });
	}
}
