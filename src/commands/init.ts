import { basename } from 'node:path';

import { Args, Flags } from '@oclif/core';
import inquirer from 'inquirer';

import { ApifyCommand } from '../lib/apify_command.js';
import { DEFAULT_LOCAL_STORAGE_DIR, EMPTY_LOCAL_CONFIG, LANGUAGE, LOCAL_CONFIG_PATH, PROJECT_TYPES } from '../lib/consts.js';
import { createPrefilledInputFileFromInputSchema } from '../lib/input_schema.js';
import { error, info, success, warning } from '../lib/outputs.js';
import { ProjectAnalyzer } from '../lib/project_analyzer.js';
import { wrapScrapyProject } from '../lib/projects/scrapy/wrapScrapyProject.js';
import { detectLocalActorLanguage, getLocalConfig, getLocalConfigOrThrow, setLocalConfig, setLocalEnv, validateActorName } from '../lib/utils.js';

export class InitCommand extends ApifyCommand<typeof InitCommand> {
    static override description = 'Initializes a new Actor project in an existing directory.\n'
    + `If the directory contains a Scrapy project in Python, the command automatically creates wrappers so that you can run your scrapers without changes.\n\n`
    + `The command creates the "${LOCAL_CONFIG_PATH}" file and the "${DEFAULT_LOCAL_STORAGE_DIR}" directory in the current directory, `
    + 'but does not touch any other existing files or directories.\n\n'
    + `WARNING: The directory at "${DEFAULT_LOCAL_STORAGE_DIR}" will be overwritten if it already exists.`;

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

        if (ProjectAnalyzer.getProjectType(cwd) === PROJECT_TYPES.SCRAPY) {
            info('The current directory looks like a Scrapy project. Using automatic project wrapping.');
            this.telemetryData.actorWrapper = PROJECT_TYPES.SCRAPY;

            return wrapScrapyProject({ projectPath: cwd });
        }

        if (!this.flags.yes && detectLocalActorLanguage().language === LANGUAGE.UNKNOWN) {
            warning('The current directory does not look like a Node.js or Python project.');
            const { c } = await inquirer.prompt([{ name: 'c', message: 'Do you want to continue?', type: 'confirm' }]);
            if (!c) return;
        }

        if (getLocalConfig()) {
            warning(`Skipping creation of "${LOCAL_CONFIG_PATH}", the file already exists in the current directory.`);
        } else {
            if (!actorName) {
                let response = null;

                while (!response) {
                    try {
                        const answer = await inquirer.prompt([{ name: 'actName', message: 'Actor name:', default: basename(cwd) }]);
                        validateActorName(answer.actName);
                        response = answer;
                    } catch (err) {
                        error((err as Error).message);
                    }
                }

                ({ actName: actorName } = response);
            }
            // Migrate apify.json to .actor/actor.json
            const localConfig = { ...EMPTY_LOCAL_CONFIG, ...await getLocalConfigOrThrow() };
            await setLocalConfig(Object.assign(localConfig, { name: actorName }), cwd);
        }

        await setLocalEnv(cwd);

        // Create prefilled INPUT.json file from the input schema prefills
        await createPrefilledInputFileFromInputSchema(cwd);

        success('The Actor has been initialized in the current directory.');
    }
}
