const { flags: flagsHelper } = require('@oclif/command');
const inquirer = require('inquirer');
const path = require('path');

const { ApifyCommand } = require('../lib/apify_command');
const outputs = require('../lib/outputs');
const { setLocalConfig, setLocalEnv, getLocalConfig, getLocalConfigOrThrow, detectLocalActorLanguage } = require('../lib/utils');
const { EMPTY_LOCAL_CONFIG, DEFAULT_LOCAL_STORAGE_DIR, LOCAL_CONFIG_PATH, LANGUAGE, PROJECT_TYPES } = require('../lib/consts');
const { createPrefilledInputFileFromInputSchema } = require('../lib/input_schema');
const { wrapScrapyProject } = require('../lib/scrapy-wrapper');
const { ProjectAnalyzer } = require('../lib/project_analyzer');

class InitCommand extends ApifyCommand {
    async run() {
        const { args, flags } = this.parse(InitCommand);
        let { actorName } = args;
        const cwd = process.cwd();

        if (flags?.wrap === 'scrapy' || ProjectAnalyzer.getProjectType(cwd) === PROJECT_TYPES.SCRAPY) {
            if (flags?.wrap !== 'scrapy') {
                outputs.info('The current directory looks like a Scrapy project. Using automatic project wrapping.');
            }

            return wrapScrapyProject({ projectPath: cwd });
        }

        if (detectLocalActorLanguage(cwd).language === LANGUAGE.UNKNOWN) {
            outputs.warning('The current directory does not look like a Node.js or Python project.');
            const { c } = await inquirer.prompt([{ name: 'c', message: 'Do you want to continue?', type: 'confirm' }]);
            if (!c) return;
        }

        if (getLocalConfig()) {
            outputs.warning(`Skipping creation of "${LOCAL_CONFIG_PATH}", the file already exists in the current directory.`);
        } else {
            if (!actorName) {
                const answer = await inquirer.prompt([{ name: 'actName', message: 'Actor name:', default: path.basename(cwd) }]);
                ({ actName: actorName } = answer);
            }
            // Migrate apify.json to .actor/actor.json
            const localConfig = { ...EMPTY_LOCAL_CONFIG, ...await getLocalConfigOrThrow() };
            await setLocalConfig(Object.assign(localConfig, { name: actorName }), cwd);
        }
        await setLocalEnv(cwd);
        // Create prefilled INPUT.json file from the input schema prefills
        await createPrefilledInputFileFromInputSchema(cwd);
        outputs.success('The Apify actor has been initialized in the current directory.');
    }
}

InitCommand.description = 'Initializes a new actor project in an existing directory.\n'
    + `The command only creates the "${LOCAL_CONFIG_PATH}" file and the "${DEFAULT_LOCAL_STORAGE_DIR}" directory in the current directory, `
    + 'but will not touch anything else.\n\n'
    + `WARNING: The directory at "${DEFAULT_LOCAL_STORAGE_DIR}" will be overwritten if it already exists.`;

InitCommand.args = [
    {
        name: 'actorName',
        required: false,
        description: 'Name of the actor. If not provided, you will be prompted for it.',
    },
];

InitCommand.flags = {
    wrap: flagsHelper.string({
        char: 'w',
        required: false,
        options: ['scrapy'],
        description: 'Enhance an existing project with Apify middleware. Currently supports wrapping Scrapy projects only.',
    }),
};

module.exports = InitCommand;
