import process from 'node:process';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { CommandExitCodes } from '../../lib/consts.js';
import type { EnvVarComparisonStatus } from '../../lib/env-vars/diff.js';
import { compareEnvVars } from '../../lib/env-vars/diff.js';
import { readDotEnv } from '../../lib/env-vars/dotenv.js';
import { envFail } from '../../lib/env-vars/errors.js';
import { envTargetFlags } from '../../lib/env-vars/flags.js';
import { describeTarget, targetJson } from '../../lib/env-vars/output.js';
import { listPlatformEnvVars } from '../../lib/env-vars/platform.js';
import { resolveEnvTarget } from '../../lib/env-vars/target.js';
import { simpleLog, success } from '../../lib/outputs.js';
import { printJsonToStdout } from '../../lib/utils.js';

export class EnvDiffCommand extends ApifyCommand<typeof EnvDiffCommand> {
	static override name = 'diff' as const;

	static override description =
		"Compares .env with the env vars of an Actor version. Exits with 0 when they're in sync and with 1 on any difference, so it fits pre-commit hooks and CI. Secrets are compared by name only.";

	static override examples = [
		{
			description: 'Check that .env and the Actor in the current directory are in sync.',
			command: 'apify env diff',
		},
		{
			description: 'Compare the .env of one Actor in a monorepo with its version 1.0.',
			command: 'apify env diff --dir actors/scraper --version 1.0',
		},
		{
			description: 'List the differences as JSON, for example in a CI job.',
			command: 'apify env diff --json',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-env-diff';

	static override enableJsonFlag = true;

	static override enableProfileFlag = true;

	static override flags = {
		...envTargetFlags,
	};

	async run() {
		const target = await resolveEnvTarget(this.flags);
		const dotEnv = readDotEnv(target.actorDir);

		if (!dotEnv.exists) {
			envFail(
				`No .env file in ${target.actorDir}. Create one with a NAME=value line per variable, or run apify env pull to start from the platform values.`,
			);
		}

		const comparison = compareEnvVars(dotEnv.vars, await listPlatformEnvVars(target));
		const namesWith = (status: EnvVarComparisonStatus) =>
			comparison.filter((entry) => entry.status === status).map(({ name }) => name);

		const onlyInDotEnv = namesWith('onlyLocal');
		const onlyOnPlatform = namesWith('onlyPlatform');
		const valuesDiffer = namesWith('differs');
		const inSync = !onlyInDotEnv.length && !onlyOnPlatform.length && !valuesDiffer.length;

		if (!inSync) process.exitCode = CommandExitCodes.EnvDiffFound;

		if (this.flags.json) {
			printJsonToStdout({
				ok: true,
				operation: 'env-diff',
				...targetJson(target),
				inSync,
				onlyInDotEnv,
				onlyOnPlatform,
				valuesDiffer,
			});
			return;
		}

		if (inSync) {
			success({ message: `.env and ${describeTarget(target)} are in sync.`, stdout: true });
			return;
		}

		const lines = [`.env and ${describeTarget(target)} differ:`];
		if (onlyInDotEnv.length) lines.push(`  Only in .env: ${onlyInDotEnv.join(', ')}`);
		if (onlyOnPlatform.length) lines.push(`  Only on the platform: ${onlyOnPlatform.join(', ')}`);
		if (valuesDiffer.length) lines.push(`  Different values: ${valuesDiffer.join(', ')}`);
		simpleLog({ message: lines.join('\n'), stdout: true });
	}
}
