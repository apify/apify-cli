import { resolve } from 'node:path';
import process from 'node:process';

import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Flags, YesFlag } from '../../lib/command-framework/flags.js';
import { CommandExitCodes, LOCAL_CONFIG_PATH } from '../../lib/consts.js';
import {
	checkDotEnvWritable,
	ensureDotEnvGitignored,
	isDotEnvGitignored,
	readDotEnv,
	updateDotEnvContent,
	writeDotEnv,
} from '../../lib/env-vars/dotenv.js';
import { envFail } from '../../lib/env-vars/errors.js';
import { envTargetFlags } from '../../lib/env-vars/flags.js';
import { countLegacyEnvVars, SECRET_REF_PATTERN } from '../../lib/env-vars/legacy.js';
import {
	readActorJsonDocument,
	readLegacySecrets,
	removeEnvironmentVariablesFromActorJson,
	resolveLegacyEnvVars,
} from '../../lib/env-vars/migrate.js';
import { assertDirectory } from '../../lib/env-vars/target.js';
import { useYesNoConfirm } from '../../lib/hooks/user-confirmations/useYesNoConfirm.js';
import { info, simpleLog, success, warning } from '../../lib/outputs.js';

const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const plural = (count: number) => `${count} ${count === 1 ? 'variable' : 'variables'}`;

export class EnvMigrateCommand extends ApifyCommand<typeof EnvMigrateCommand> {
	static override name = 'migrate' as const;

	static override description =
		'Moves "environmentVariables" from .actor/actor.json into .env, resolving "@secret" references from the local secrets store. Keys already in .env keep their value. Then removes the block from actor.json.';

	static override examples = [
		{
			description: 'Move the env vars of the Actor in the current directory to its .env file.',
			command: 'apify env migrate',
		},
		{
			description: 'Migrate one Actor in a monorepo without a prompt, writing missing secrets as empty keys.',
			command: 'apify env migrate --dir actors/scraper --allow-missing-secrets --yes',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-env-migrate';

	static override interactive = true;

	static override interactiveNote = 'Shows what moves and asks before it changes files. Pass --yes to skip the prompt.';

	static override flags = {
		dir: envTargetFlags.dir,
		'allow-missing-secrets': Flags.boolean({
			description:
				"Write the keys of secrets that aren't in ~/.apify/secrets.json with an empty value instead of stopping.",
			default: false,
		}),
		...YesFlag(),
	};

	async run() {
		const { yes, allowMissingSecrets } = this.flags;

		const actorDir = resolve(process.cwd(), this.flags.dir ?? '.');
		assertDirectory(actorDir);

		const { config } = readActorJsonDocument(actorDir);
		if (!Object.hasOwn(config, 'environmentVariables')) {
			info({ message: `Nothing to migrate: ${LOCAL_CONFIG_PATH} has no "environmentVariables".` });
			return;
		}

		const { environmentVariables } = config;
		if (!environmentVariables || typeof environmentVariables !== 'object' || Array.isArray(environmentVariables)) {
			envFail(
				`"environmentVariables" in ${LOCAL_CONFIG_PATH} isn't an object. Fix it or remove it, then run the command again.`,
				CommandExitCodes.InvalidActorJson,
			);
		}

		const env = environmentVariables as Record<string, unknown>;
		// Only read the secrets store when something refers to it, so a broken store doesn't stop a project without references.
		const secrets = countLegacyEnvVars(env).secretRefsCount > 0 ? readLegacySecrets() : {};
		const { values, missingSecrets } = resolveLegacyEnvVars(env, secrets);

		const missingNames = [...new Set(missingSecrets.map(({ secretName }) => secretName))].sort(byName);
		if (missingNames.length && !allowMissingSecrets) {
			envFail(
				`These secrets aren't in the local secrets store: ${missingNames.join(', ')}. Add them with apify secrets add, or pass --allow-missing-secrets to write their keys empty.`,
			);
		}

		const dotEnv = readDotEnv(actorDir);
		// actor.json order, so new keys land in .env in the order the project had them.
		const newKeys = Object.keys(values).filter((name) => !Object.hasOwn(dotEnv.vars, name));
		const names = Object.keys(values).sort(byName);
		const toAdd = [...newKeys].sort(byName);
		const conflicts = names.filter((name) => Object.hasOwn(dotEnv.vars, name) && dotEnv.vars[name] !== values[name]);
		const alreadyThere = names.filter((name) => Object.hasOwn(dotEnv.vars, name) && dotEnv.vars[name] === values[name]);

		// Built before the prompt, so a value that can't be written fails before anything changes.
		let content: string | undefined;
		if (newKeys.length) {
			checkDotEnvWritable(actorDir);
			content = updateDotEnvContent(dotEnv.content, Object.fromEntries(newKeys.map((name) => [name, values[name]])));
		}

		const missingByKey = new Map(missingSecrets.map(({ key, secretName }) => [key, secretName]));
		const describeSource = (name: string) => {
			const raw = env[name];
			if (missingByKey.has(name)) return ` (empty: secret ${missingByKey.get(name)} isn't in the local secrets store)`;
			return typeof raw === 'string' && SECRET_REF_PATTERN.test(raw) ? ` (from secret ${raw.slice(1)})` : '';
		};

		const lines = [
			...toAdd.map((name) => `  ${chalk.green('+')} ${name}${describeSource(name)}`),
			...alreadyThere.map((name) => `  ${chalk.gray('=')} ${name} (already in .env)`),
			...conflicts.map(
				(name) => `  ${chalk.yellow('~')} ${name} (.env keeps its value; actor.json has a different one)`,
			),
		];
		const gitignored = await isDotEnvGitignored(actorDir);

		simpleLog({
			message: [
				names.length
					? `Moving "environmentVariables" from ${LOCAL_CONFIG_PATH} to ${dotEnv.path}:`
					: `"environmentVariables" in ${LOCAL_CONFIG_PATH} is empty, so no variables move to .env.`,
				...lines,
				...(gitignored ? [] : [`Adding .env to .gitignore.`]),
				`Removing "environmentVariables" from ${LOCAL_CONFIG_PATH}.`,
			].join('\n'),
			stdout: true,
		});

		if (missingNames.length) {
			warning({
				message: `These secrets aren't in the local secrets store, so their keys are written empty: ${missingNames.join(', ')}. Fill them in .env.`,
			});
		}

		const confirmed = await useYesNoConfirm({
			message: 'Migrate these variables?',
			default: false,
			preAnswered: yes || undefined,
			errorMessageForStdin: 'apify env migrate asks before it changes files. To migrate without a prompt, pass --yes.',
		});

		if (!confirmed) {
			info({ message: 'Nothing was changed.' });
			return;
		}

		// .gitignore first, so the resolved secrets never land in a .env that Git would pick up.
		const { added: gitignoreUpdated, tracked } = await ensureDotEnvGitignored(actorDir);
		if (gitignoreUpdated) info({ message: 'Added .env to .gitignore.' });
		if (tracked) {
			warning({
				message: ".env is tracked by Git, so .gitignore doesn't keep it out of commits. Run git rm --cached .env.",
			});
		}

		// .env before actor.json: a failure in between leaves the values in both files, never in neither.
		if (content !== undefined) writeDotEnv(actorDir, content);
		removeEnvironmentVariablesFromActorJson(actorDir);

		for (const name of conflicts) {
			warning({ message: `Kept the .env value of ${name}; actor.json had a different one.` });
		}

		success({
			message: `Moved ${plural(toAdd.length)} to .env.`,
			stdout: true,
		});

		if (names.length) {
			info({ message: 'Next step: run apify env push to set these values on the platform.' });
		}
	}
}
