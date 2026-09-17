import process from 'node:process';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { CommandExitCodes, LOCAL_CONFIG_PATH } from '../../lib/consts.js';
import { useActorConfig } from '../../lib/hooks/useActorConfig.js';
import { error, info, success } from '../../lib/outputs.js';
import { findSecretReferences, getSecretsFile, validateEnvironmentVariablesShape } from '../../lib/secrets.js';
import { printJsonToStdout } from '../../lib/utils.js';

export class SecretsCheckCommand extends ApifyCommand<typeof SecretsCheckCommand> {
	static override name = 'check' as const;

	static override description =
		`Verifies that every "@name" secret reference in ${LOCAL_CONFIG_PATH} resolves to a locally stored secret, ` +
		`and that "environmentVariables" is shaped as an object (key-value map). ` +
		`Runs automatically as a preflight during 'apify push' — use this command to check standalone.`;

	static override examples = [
		{
			description: 'Verify that all @-references in .actor/actor.json point to secrets you have added locally.',
			command: 'apify secrets check',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-secrets-check';

	static override enableJsonFlag = true;

	static override flags = {
		dir: Flags.string({
			description: 'Directory of the Actor whose .actor/actor.json should be checked.',
			required: false,
		}),
	};

	async run() {
		const { json } = this.flags;
		const cwd = this.flags.dir ?? process.cwd();

		const actorConfigResult = await useActorConfig({ cwd });
		if (actorConfigResult.isErr()) {
			error({ message: actorConfigResult.unwrapErr().message });
			process.exitCode = CommandExitCodes.InvalidActorJson;
			return;
		}

		const { config, exists } = actorConfigResult.unwrap();
		if (!exists) {
			error({
				message: `No ${LOCAL_CONFIG_PATH} found in ${cwd}. Run 'apify init' first, or point at the Actor directory with --dir.`,
			});
			process.exitCode = CommandExitCodes.InvalidActorJson;
			return;
		}

		const rawEnv = config?.environmentVariables;

		const shapeError = validateEnvironmentVariablesShape(rawEnv);
		if (shapeError) {
			if (json) {
				printJsonToStdout({ ok: false, shapeError, missing: [], referenced: [] });
			} else {
				error({ message: shapeError });
			}
			process.exitCode = CommandExitCodes.InvalidActorJson;
			return;
		}

		if (!rawEnv || Object.keys(rawEnv as object).length === 0) {
			if (json) {
				printJsonToStdout({ ok: true, missing: [], referenced: [] });
				return;
			}
			info({
				message: `No "environmentVariables" declared in ${LOCAL_CONFIG_PATH}. Nothing to check.`,
				stdout: true,
			});
			return;
		}

		const env = rawEnv as Record<string, string>;
		const refs = findSecretReferences(env);
		const secrets = getSecretsFile();
		const missing = refs.filter((ref) => !(ref.name in secrets));

		if (json) {
			printJsonToStdout({
				ok: missing.length === 0,
				referenced: refs,
				missing,
			});
			if (missing.length > 0) {
				process.exitCode = CommandExitCodes.InvalidActorJson;
			}
			return;
		}

		if (missing.length > 0) {
			const listing = missing
				.map(({ envKey, name }) => `  - ${name}  (referenced by environmentVariables.${envKey})`)
				.join('\n');
			const addCommands = missing.map(({ name }) => `  apify secrets add ${name} <SECRET_VALUE>`).join('\n');
			error({
				message:
					`The following secrets referenced in ${LOCAL_CONFIG_PATH} are missing from local storage:\n${listing}\n\n` +
					`Add them by running:\n${addCommands}`,
			});
			process.exitCode = CommandExitCodes.InvalidActorJson;
			return;
		}

		success({
			message:
				refs.length === 0
					? `No "@name" secret references found in ${LOCAL_CONFIG_PATH}.`
					: `All ${refs.length} secret reference(s) in ${LOCAL_CONFIG_PATH} resolve to locally stored secrets.`,
			stdout: true,
		});
	}
}
