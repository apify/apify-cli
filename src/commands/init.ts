import { basename } from 'node:path';
import process from 'node:process';

import { ApifyCommand } from '../lib/command-framework/apify-command.js';
import { Args } from '../lib/command-framework/args.js';
import { Flags, YesFlag } from '../lib/command-framework/flags.js';
import { CommandExitCodes, DEFAULT_LOCAL_STORAGE_DIR, EMPTY_LOCAL_CONFIG, LOCAL_CONFIG_PATH } from '../lib/consts.js';
import { useActorConfig } from '../lib/hooks/useActorConfig.js';
import { ProjectLanguage, useCwdProject } from '../lib/hooks/useCwdProject.js';
import { useUserInput } from '../lib/hooks/user-confirmations/useUserInput.js';
import { useYesNoConfirm } from '../lib/hooks/user-confirmations/useYesNoConfirm.js';
import { createPrefilledInputFileFromInputSchema } from '../lib/input_schema.js';
import { wrapScrapyProject } from '../lib/projects/scrapy/wrapScrapyProject.js';
import { sanitizeActorName, setLocalConfig, setLocalEnv, validateActorName } from '../lib/utils.js';

export class InitCommand extends ApifyCommand<typeof InitCommand> {
	static override name = 'init' as const;

	static override description =
		`Sets up an Actor project in your current directory by creating actor.json and storage files.\n` +
		`If the directory contains a Scrapy project in Python, the command automatically creates wrappers so that you can run your scrapers without changes.\n` +
		`Creates the '${LOCAL_CONFIG_PATH}' file and the '${DEFAULT_LOCAL_STORAGE_DIR}' directory in the current directory, but does not touch any other existing files or directories.\n\n` +
		`WARNING: Overwrites existing '${DEFAULT_LOCAL_STORAGE_DIR}' directory.`;

	static override group = 'Local Actor Development';

	static override interactive = true;

	static override interactiveNote =
		'Prompts for an Actor name if not provided. To run non-interactively, pass the Actor name as a positional argument, or pass --yes to accept the default (current directory name).';

	static override examples = [
		{
			description: 'Initialize an Actor in the current directory, prompting for a name.',
			command: 'apify init',
		},
		{
			description: 'Initialize non-interactively with an explicit Actor name.',
			command: 'apify init my-actor',
		},
		{
			description: 'Initialize non-interactively, accepting the default Actor name.',
			command: 'apify init --yes',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-init';

	static override args = {
		actorName: Args.string({
			required: false,
			description: 'Name of the Actor. If not provided, you will be prompted for it.',
		}),
	};

	static override flags = {
		...YesFlag(),
		dockerfile: Flags.string({
			description: 'Path to a Dockerfile to use for the Actor (e.g., "./Dockerfile" or "./docker/Dockerfile").',
			required: false,
		}),
	};

	async run() {
		let { actorName } = this.args;
		const cwd = process.cwd();

		const projectResult = await useCwdProject();

		// TODO: use direct .unwrap() once we migrate to yargs
		if (projectResult.isErr()) {
			this.logger.stderr.error(projectResult.unwrapErr().message);
			process.exit(1);
		}

		const project = projectResult.unwrap();

		if (project.warnings?.length) {
			for (const w of project.warnings) {
				this.logger.stderr.warning(w);
			}
		}

		let defaultActorName = basename(cwd);
		if (project.type === ProjectLanguage.Python && project.entrypoint?.path) {
			const entryPath = project.entrypoint.path;
			// Extract the actual package name (last segment of dotted path)
			const packageName = entryPath.includes('.') ? entryPath.split('.').pop()! : entryPath;
			defaultActorName = sanitizeActorName(packageName);
		}

		if (project.type === ProjectLanguage.Scrapy) {
			this.logger.stderr.info(
				'The current directory looks like a Scrapy project. Using automatic project wrapping.',
			);
			this.telemetryData.actorWrapper = 'scrapy';

			return wrapScrapyProject({ projectPath: cwd });
		}

		if (!this.flags.yes && project.type === ProjectLanguage.Unknown) {
			this.logger.stderr.warning('The current directory does not look like a Node.js or Python project.');

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
			this.logger.stderr.warning(
				`Skipping creation of '${LOCAL_CONFIG_PATH}', the file already exists in the current directory.`,
			);
		} else {
			if (actorConfig.isErr()) {
				this.logger.stderr.error(actorConfig.unwrapErr().message);
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
							default: defaultActorName,
						});

						validateActorName(answer);

						response = answer;
					} catch (err) {
						this.logger.stderr.error((err as Error).message);
					}
				}

				actorName = response;
			}

			// Migrate apify.json to .actor/actor.json
			const localConfig = {
				...EMPTY_LOCAL_CONFIG,
				...actorConfig.unwrap().config,
			};
			const configToWrite: Record<string, unknown> = {
				...localConfig,
				name: actorName,
			};

			// Add dockerfile field if provided
			if (this.flags.dockerfile) {
				configToWrite.dockerfile = this.flags.dockerfile;
			}

			await setLocalConfig(configToWrite, cwd);
		}

		await setLocalEnv(cwd);

		// Create prefilled INPUT.json file from the input schema prefills
		await createPrefilledInputFileFromInputSchema(cwd);

		this.logger.stderr.success('The Actor has been initialized in the current directory.');
	}
}
