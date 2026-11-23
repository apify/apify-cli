import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { YesFlag } from '../../lib/command-framework/flags.js';
import {
	checkDotEnvWritable,
	describeMalformedLines,
	ensureDotEnvGitignored,
	readDotEnv,
	updateDotEnvContent,
	writeDotEnv,
} from '../../lib/env-vars/dotenv.js';
import { envTargetFlags } from '../../lib/env-vars/flags.js';
import { describeTarget, skipInvalidDotEnvNames, targetJson } from '../../lib/env-vars/output.js';
import { listPlatformEnvVars } from '../../lib/env-vars/platform.js';
import { resolveEnvTarget } from '../../lib/env-vars/target.js';
import { useYesNoConfirm } from '../../lib/hooks/user-confirmations/useYesNoConfirm.js';
import { info, simpleLog, success, warning } from '../../lib/outputs.js';
import { printJsonToStdout } from '../../lib/utils.js';

const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export class EnvPullCommand extends ApifyCommand<typeof EnvPullCommand> {
	static override name = 'pull' as const;

	static override description =
		"Writes the env vars of an Actor version into .env. Secret values can't be read back, so their keys are written empty. In an existing .env, it updates plain variables and keeps the local value of secrets and of keys that exist only locally.";

	static override examples = [
		{
			description: 'Write the env vars of the Actor in the current directory into its .env file.',
			command: 'apify env pull',
		},
		{
			description: 'Update the .env of one Actor in a monorepo from version 1.0 without a prompt.',
			command: 'apify env pull --dir actors/scraper --version 1.0 --yes',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-env-pull';

	static override enableJsonFlag = true;

	static override enableProfileFlag = true;

	static override interactive = true;

	static override interactiveNote = 'Asks before it changes an existing .env file. Pass --yes to skip the prompt.';

	static override flags = {
		...envTargetFlags,
		...YesFlag(),
	};

	async run() {
		const { json, yes } = this.flags;

		const target = await resolveEnvTarget(this.flags);
		const platform = await listPlatformEnvVars(target);
		const dotEnv = readDotEnv(target.actorDir);
		if (!dotEnv.exists) checkDotEnvWritable(target.actorDir);

		const malformedLinesWarning = describeMalformedLines(dotEnv);
		if (malformedLinesWarning) warning({ message: `${malformedLinesWarning} They stay in .env unchanged.` });

		// Platform order, so a new .env lists the variables as the platform does.
		const updates: Record<string, string> = {};
		const added: string[] = [];
		const updated: string[] = [];
		const unchanged: string[] = [];
		const keptLocal: string[] = [];
		const secretsEmpty: string[] = [];

		for (const { name, isSecret, value = '' } of skipInvalidDotEnvNames(platform)) {
			const isLocal = Object.hasOwn(dotEnv.vars, name);
			if (isSecret) {
				if (isLocal) {
					keptLocal.push(name);
				} else {
					updates[name] = '';
					added.push(name);
					secretsEmpty.push(name);
				}
			} else if (!isLocal) {
				updates[name] = value;
				added.push(name);
			} else if (dotEnv.vars[name] !== value) {
				updates[name] = value;
				updated.push(name);
			} else {
				unchanged.push(name);
			}
		}

		const toWrite = Object.keys(updates).length > 0;
		const content = toWrite ? updateDotEnvContent(dotEnv.content, updates) : undefined;

		if (dotEnv.exists && !toWrite) {
			info({ message: '.env is already up to date.' });
		} else if (dotEnv.exists) {
			const lines = [
				...added.map((name) => ({
					name,
					line: `  ${chalk.green('+')} ${name}${secretsEmpty.includes(name) ? ' (secret, empty)' : ''}`,
				})),
				...updated.map((name) => ({ name, line: `  ${chalk.yellow('~')} ${name} (local value replaced)` })),
			].sort((a, b) => byName(a.name, b.name));

			simpleLog({
				message: [`Changes to ${dotEnv.path}:`, ...lines.map(({ line }) => line)].join('\n'),
				stdout: !json,
			});

			const confirmed = await useYesNoConfirm({
				message: `Update ${dotEnv.path}?`,
				default: false,
				preAnswered: yes || undefined,
				errorMessageForStdin:
					'apify env pull asks before it changes an existing .env. To update it without a prompt, pass --yes.',
			});

			if (!confirmed) {
				info({ message: 'Nothing was changed.' });
				return;
			}
		} else if (!toWrite) {
			info({ message: `No env vars on ${describeTarget(target)}, so no .env was written.` });
		}

		const { added: gitignoreUpdated, tracked } = await ensureDotEnvGitignored(target.actorDir);
		if (gitignoreUpdated) info({ message: 'Added .env to .gitignore.' });
		if (tracked) {
			warning({
				message: ".env is tracked by Git, so .gitignore doesn't keep it out of commits. Run git rm --cached .env.",
			});
		}

		if (content !== undefined) {
			writeDotEnv(target.actorDir, content);
			if (!json) {
				const count = Object.keys(updates).length;
				success({
					message: `Wrote ${count} ${count === 1 ? 'variable' : 'variables'} from ${describeTarget(target)} to ${dotEnv.path}.`,
					stdout: true,
				});
			}
		}

		if (secretsEmpty.length) {
			info({
				message: `Secret values can't be read back, so these keys are empty in .env: ${[...secretsEmpty].sort(byName).join(', ')}. apify env push skips empty keys.`,
			});
		}

		if (json) {
			printJsonToStdout({
				ok: true,
				operation: 'env-pull',
				...targetJson(target),
				path: dotEnv.path,
				created: !dotEnv.exists && content !== undefined,
				added: added.sort(byName),
				updated: updated.sort(byName),
				unchanged: unchanged.sort(byName),
				keptLocal: keptLocal.sort(byName),
				secretsEmpty: secretsEmpty.sort(byName),
				gitignoreUpdated,
			});
		}
	}
}
