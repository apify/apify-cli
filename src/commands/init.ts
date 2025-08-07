import { basename } from 'node:path';
import process from 'node:process';

import { ApifyCommand } from '../lib/command-framework/apify-command.js';
import { Args } from '../lib/command-framework/args.js';
import { Flags } from '../lib/command-framework/flags.js';
import { CommandExitCodes, DEFAULT_LOCAL_STORAGE_DIR, EMPTY_LOCAL_CONFIG, LOCAL_CONFIG_PATH } from '../lib/consts.js';
import { useActorConfig } from '../lib/hooks/useActorConfig.js';
import { ProjectLanguage, useCwdProject } from '../lib/hooks/useCwdProject.js';
import { useUserInput } from '../lib/hooks/user-confirmations/useUserInput.js';
import { useYesNoConfirm } from '../lib/hooks/user-confirmations/useYesNoConfirm.js';
import { createPrefilledInputFileFromInputSchema } from '../lib/input_schema.js';
import { error, info, success, warning } from '../lib/outputs.js';
import { wrapScrapyProject } from '../lib/projects/scrapy/wrapScrapyProject.js';
import { setLocalConfig, setLocalEnv, validateActorName } from '../lib/utils.js';

export class InitCommand extends ApifyCommand<typeof InitCommand> {
	static override name = 'init' as const;

	static override description =
		`Sets up an Actor project in your current directory by creating actor.json and storage files.\n` +
		`If the directory contains a Scrapy project in Python, the command automatically creates wrappers so that you can run your scrapers without changes.\n` +
		`Creates the '${LOCAL_CONFIG_PATH}' file and the '${DEFAULT_LOCAL_STORAGE_DIR}' directory in the current directory, but does not touch any other existing files or directories.\n\n` +
		`WARNING: Overwrites existing '${DEFAULT_LOCAL_STORAGE_DIR}' directory.`;

	static override args = {
		actorName: Args.string({
			required: false,
			description: 'Name of the Actor. If not provided, you will be prompted for it.',
		}),
	};

	static override flags = {
		yes: Flags.boolean({
			char: 'y',
			description:
				'Automatic yes to prompts; assume "yes" as answer to all prompts. Note that in some cases, the command may still ask for confirmation.',
			required: false,
		}),
	};

	async run() {
		let { actorName } = this.args;
		const cwd = process.cwd();

		const projectResult = await useCwdProject();

		// TODO: use direct .unwrap() once we migrate to yargs
		if (projectResult.isErr()) {
			error({ message: projectResult.unwrapErr().message });
			process.exit(1);
		}

		const project = projectResult.unwrap();

		if (project.type === ProjectLanguage.Scrapy) {
			info({ message: 'The current directory looks like a Scrapy project. Using automatic project wrapping.' });
			this.telemetryData.actorWrapper = 'scrapy';

			return wrapScrapyProject({ projectPath: cwd });
		}

		if (!this.flags.yes && project.type === ProjectLanguage.Unknown) {
			warning({ message: 'The current directory does not look like a Node.js or Python project.' });

			const confirmed = await useYesNoConfirm({
				message: 'Do you want to continue?',
				providedConfirmFromStdin: this.flags.yes,
			});

			if (!confirmed) {
				return;
			}
		}

		const actorConfig = await useActorConfig({ cwd });

		if (actorConfig.isOkAnd((cfg) => cfg.exists && !cfg.migrated)) {
			warning({
				message: `Skipping creation of '${LOCAL_CONFIG_PATH}', the file already exists in the current directory.`,
			});
		} else {
			if (actorConfig.isErr()) {
				error({ message: actorConfig.unwrapErr().message });
				process.exitCode = CommandExitCodes.InvalidActorJson;
				return;
			}

			if (!actorName) {
				let response = actorConfig.isOkAnd((cfg) => cfg.exists)
					? (actorConfig.unwrap().config.name as string)
					: null;

				// TODO: see if we can use promptActorName instead
				while (!response) {
					try {
						const answer = await useUserInput({
							message: 'Actor name:',
							default: basename(cwd),
						});

						validateActorName(answer);

						response = answer;
					} catch (err) {
						error({ message: (err as Error).message });
					}
				}

				actorName = response;
			}

			// Migrate apify.json to .actor/actor.json
			const localConfig = { ...EMPTY_LOCAL_CONFIG, ...actorConfig.unwrap().config };
			await setLocalConfig(Object.assign(localConfig, { name: actorName }), cwd);
		}

		await setLocalEnv(cwd);

		// Create prefilled INPUT.json file from the input schema prefills
		await createPrefilledInputFileFromInputSchema(cwd);

		success({ message: 'The Actor has been initialized in the current directory.' });
	}
}
