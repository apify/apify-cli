import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { envFail } from '../../lib/env-vars/errors.js';
import { envTargetFlags } from '../../lib/env-vars/flags.js';
import { describeTarget, escapeName, printRebuildReminder, targetJson } from '../../lib/env-vars/output.js';
import {
	createPlatformEnvVar,
	getPlatformEnvVar,
	updatePlatformEnvVar,
	validateEnvVarName,
	validateEnvVarValue,
} from '../../lib/env-vars/platform.js';
import { resolveEnvTarget } from '../../lib/env-vars/target.js';
import { readEnvVarValue } from '../../lib/env-vars/value-input.js';
import { info, success } from '../../lib/outputs.js';
import { printJsonToStdout } from '../../lib/utils.js';

const typeName = (isSecret: boolean) => (isSecret ? 'secret' : 'plain');

export class EnvSetCommand extends ApifyCommand<typeof EnvSetCommand> {
	static override name = 'set' as const;

	static override description =
		'Creates an env var on an Actor version, or updates it when it exists. The value comes from a prompt or standard input, never from an argument, so it stays out of shell history.';

	static override examples = [
		{
			description: 'Set a secret env var on the Actor in the current directory. Prompts for the value.',
			command: 'apify env set API_KEY --secret',
		},
		{
			description: 'Set a secret env var from standard input, for scripts and agents.',
			command: `printf '%s' "$API_KEY" | apify env set API_KEY --secret`,
		},
		{
			description: 'Set an env var on an Actor without a local project.',
			command: 'apify env set LOG_LEVEL --actor username/my-actor',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-env-set';

	static override enableJsonFlag = true;

	static override enableProfileFlag = true;

	static override interactive = true;

	static override interactiveNote =
		'Prompts for the value in a terminal. Without one, reads the value from standard input.';

	static override args = {
		name: Args.string({
			required: true,
			description: 'Name of the env var.',
		}),
	};

	static override flags = {
		...envTargetFlags,
		secret: Flags.boolean({
			description:
				'Store the value as a secret, which no one can read back. Use --no-secret to store it as plain text. An existing variable keeps its type when neither is passed.',
			required: false,
		}),
	};

	async run() {
		const { name } = this.args;

		validateEnvVarName(name);
		const shownName = escapeName(name);

		const target = await resolveEnvTarget(this.flags);
		const existing = await getPlatformEnvVar(target, name);
		const isSecret = this.flags.secret ?? existing?.isSecret ?? false;

		const value = await readEnvVarValue({ name: shownName, masked: isSecret });
		validateEnvVarValue(shownName, value);

		try {
			if (existing) {
				await updatePlatformEnvVar(target, { name, value, isSecret });
			} else {
				await createPlatformEnvVar(target, { name, value, isSecret });
			}
		} catch (err) {
			envFail(`Couldn't set ${shownName} on ${describeTarget(target)}: ${(err as Error).message}`, 1);
		}

		if (existing && existing.isSecret !== isSecret) {
			info({ message: `Changed ${shownName} from ${typeName(existing.isSecret)} to ${typeName(isSecret)}.` });
		}

		if (this.flags.json) {
			printJsonToStdout({
				ok: true,
				operation: 'env-set',
				...targetJson(target),
				name,
				isSecret,
				created: !existing,
			});
		} else {
			success({
				message: `${existing ? 'Updated' : 'Created'} ${shownName}${isSecret ? ' (secret)' : ''} on ${describeTarget(target)}.`,
				stdout: true,
			});
		}

		printRebuildReminder(target);
	}
}
