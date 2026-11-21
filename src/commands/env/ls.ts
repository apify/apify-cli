import process from 'node:process';

import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { envTargetFlags, resolveEnvTarget } from '../../lib/commands/resolve-env-target.js';
import { CompactMode, ResponsiveTable } from '../../lib/commands/responsive-table.js';
import { error, simpleLog } from '../../lib/outputs.js';
import { getLoggedClientOrThrow, printJsonToStdout } from '../../lib/utils.js';

type ListedEnvVar = { name: string; isSecret: true } | { name: string; isSecret: false; value: string };

export class EnvLsCommand extends ApifyCommand<typeof EnvLsCommand> {
	static override name = 'ls' as const;

	static override enableProfileFlag = true;

	static override description = `Lists the environment variables of an Actor version on the Apify platform. Secret values aren't shown.`;

	static override examples = [
		{
			description: 'List the environment variables of the Actor in the current directory.',
			command: 'apify env ls',
		},
		{
			description: 'List the environment variables of version 0.1 of an Actor without a local project.',
			command: 'apify env ls --actor username/my-actor --version 0.1',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-env-ls';

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

		const { items } = await client.actor(target.actorId).version(target.versionNumber).envVars().list();

		// Secret values are dropped here, so nothing below can print them.
		const envVars: ListedEnvVar[] = items
			.map(({ name, value, isSecret }): ListedEnvVar =>
				isSecret ? { name: name!, isSecret: true } : { name: name!, isSecret: false, value: value ?? '' },
			)
			.sort((a, b) => a.name.localeCompare(b.name));

		if (this.flags.json) {
			printJsonToStdout({
				actor: { id: target.actorId, name: target.actorName },
				version: target.versionNumber,
				envVars,
			});
			return;
		}

		if (envVars.length === 0) {
			simpleLog({
				message: `Version ${target.versionNumber} of Actor ${target.actorName} doesn't have any environment variables.`,
				stdout: true,
			});
			return;
		}

		const table = new ResponsiveTable({
			allColumns: ['Name', 'Type', 'Value'],
			mandatoryColumns: ['Name', 'Type', 'Value'],
		});

		for (const envVar of envVars) {
			table.pushRow({
				Name: envVar.name,
				Type: envVar.isSecret ? 'secret' : 'plain',
				Value: envVar.isSecret ? chalk.gray('(hidden)') : envVar.value,
			});
		}

		simpleLog({
			message: `${chalk.reset('Environment variables of version')} ${chalk.yellow(target.versionNumber)} of Actor ${chalk.yellow(target.actorName)}\n\n${table.render(CompactMode.None)}`,
			stdout: true,
		});
	}
}
