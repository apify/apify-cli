import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { YesFlag } from '../../lib/command-framework/flags.js';
import { CommandExitCodes } from '../../lib/consts.js';
import { envFail } from '../../lib/env-vars/errors.js';
import { envTargetFlags } from '../../lib/env-vars/flags.js';
import { describeTarget, escapeName, printRebuildReminder, targetJson } from '../../lib/env-vars/output.js';
import { deletePlatformEnvVar, getPlatformEnvVar, validateEnvVarName } from '../../lib/env-vars/platform.js';
import { resolveEnvTarget } from '../../lib/env-vars/target.js';
import { useYesNoConfirm } from '../../lib/hooks/user-confirmations/useYesNoConfirm.js';
import { info, success } from '../../lib/outputs.js';
import { printJsonToStdout } from '../../lib/utils.js';

export class EnvRmCommand extends ApifyCommand<typeof EnvRmCommand> {
	static override name = 'rm' as const;

	static override description = 'Deletes an env var from an Actor version.';

	static override examples = [
		{
			description: 'Delete an env var from the Actor in the current directory. Asks for confirmation.',
			command: 'apify env rm API_KEY',
		},
		{
			description: 'Delete an env var from version 1.0 of an Actor without a prompt.',
			command: 'apify env rm LOG_LEVEL --actor username/my-actor --version 1.0 --yes',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-env-rm';

	static override enableJsonFlag = true;

	static override enableProfileFlag = true;

	static override interactive = true;

	static override interactiveNote = 'Prompts for confirmation. Pass --yes to skip it.';

	static override args = {
		name: Args.string({
			required: true,
			description: 'Name of the env var.',
		}),
	};

	static override flags = {
		...envTargetFlags,
		...YesFlag(),
	};

	async run() {
		const { name } = this.args;

		validateEnvVarName(name);
		const shownName = escapeName(name);

		const target = await resolveEnvTarget(this.flags);

		if (!(await getPlatformEnvVar(target, name))) {
			envFail(`${shownName} doesn't exist on ${describeTarget(target)}.`, CommandExitCodes.NotFound);
		}

		const confirmed = await useYesNoConfirm({
			message: `Delete ${shownName} from ${describeTarget(target)}?`,
			default: false,
			preAnswered: this.flags.yes || undefined,
			errorMessageForStdin: 'apify env rm asks before it deletes anything. To delete without a prompt, pass --yes.',
		});

		if (!confirmed) {
			info({ message: 'Nothing was deleted.' });
			return;
		}

		try {
			await deletePlatformEnvVar(target, name);
		} catch (err) {
			envFail(`Couldn't delete ${shownName} from ${describeTarget(target)}: ${(err as Error).message}`, 1);
		}

		if (this.flags.json) {
			printJsonToStdout({ ok: true, operation: 'env-rm', ...targetJson(target), name });
		} else {
			success({ message: `Deleted ${shownName} from ${describeTarget(target)}.`, stdout: true });
		}

		printRebuildReminder(target);
	}
}
