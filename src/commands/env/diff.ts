import { resolve } from 'node:path';
import process from 'node:process';

import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { envTargetFlags, resolveEnvTarget } from '../../lib/commands/resolve-env-target.js';
import { CommandExitCodes } from '../../lib/consts.js';
import { readDotEnv } from '../../lib/dotenv.js';
import { diffEnvVars, type PlatformEnvVar } from '../../lib/env-diff.js';
import { error, simpleLog } from '../../lib/outputs.js';
import { getLoggedClientOrThrow, printJsonToStdout } from '../../lib/utils.js';

export class EnvDiffCommand extends ApifyCommand<typeof EnvDiffCommand> {
	static override name = 'diff' as const;

	static override enableProfileFlag = true;

	static override description =
		`Compares '.env' with the environment variables of an Actor version on the Apify platform.\n` +
		`Lists the names that are only in '.env', only on the platform, or that have different values. ` +
		`Secrets are compared by name only. Values are never printed.\n\n` +
		`Exits with 0 when both sides are in sync and with 1 on any difference, so it fits pre-commit hooks and CI.`;

	static override examples = [
		{
			description: `Check that '.env' of the Actor in the current directory matches the platform.`,
			command: 'apify env diff',
		},
		{
			description: 'Check an Actor in a monorepo, with machine-readable output.',
			command: 'apify env diff --dir actors/my-actor --json',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-env-diff';

	static override flags = {
		...envTargetFlags,
	};

	static override enableJsonFlag = true;

	async run() {
		const client = await getLoggedClientOrThrow();
		const target = await resolveEnvTarget({ client, flags: this.flags });

		if (!target.ok) {
			error({ message: target.message });
			process.exitCode = target.exitCode;
			return;
		}

		const dir = resolve(process.cwd(), this.flags.dir ?? '.');
		const dotEnv = await readDotEnv(dir);

		if (!dotEnv) {
			error({ message: `No .env file in ${dir}.` });
			process.exitCode = CommandExitCodes.NotFound;
			return;
		}

		const { items } = await client.actor(target.actorId).version(target.versionNumber).envVars().list();

		// Secret values are dropped here; secrets are compared by name only.
		const platform: PlatformEnvVar[] = items.map(({ name, value, isSecret }) =>
			isSecret ? { name: name!, isSecret: true } : { name: name!, isSecret: false, value: value ?? '' },
		);

		const diff = diffEnvVars(dotEnv, platform);
		const inSync = !diff.onlyInDotEnv.length && !diff.onlyOnPlatform.length && !diff.differentValues.length;

		if (!inSync) {
			process.exitCode = CommandExitCodes.EnvDiffFound;
		}

		if (this.flags.json) {
			printJsonToStdout({
				actor: { id: target.actorId, name: target.actorName },
				version: target.versionNumber,
				inSync,
				...diff,
			});
			return;
		}

		const versionLabel = `version ${chalk.yellow(target.versionNumber)} of Actor ${chalk.yellow(target.actorName)}`;

		if (inSync) {
			simpleLog({ message: `.env and ${versionLabel} are in sync.`, stdout: true });
			return;
		}

		const sections = [
			{ title: 'Only in .env:', names: diff.onlyInDotEnv, mark: chalk.green('+') },
			{ title: 'Only on the platform:', names: diff.onlyOnPlatform, mark: chalk.red('-') },
			{ title: 'Different values:', names: diff.differentValues, mark: chalk.yellow('~') },
		]
			.filter(({ names }) => names.length)
			.map(({ title, names, mark }) => [title, ...names.map((name) => `  ${mark} ${name}`)].join('\n'));

		simpleLog({
			message: [`Comparing .env with ${versionLabel}`, ...sections].join('\n\n'),
			stdout: true,
		});
	}
}
