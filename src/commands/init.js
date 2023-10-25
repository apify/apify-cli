const path = require('path');

const inquirer = require('inquirer');

const { ApifyCommand } = require('../lib/apify_command');
const { EMPTY_LOCAL_CONFIG, DEFAULT_LOCAL_STORAGE_DIR, LOCAL_CONFIG_PATH } = require('../lib/consts');
const { createPrefilledInputFileFromInputSchema } = require('../lib/input_schema');
const outputs = require('../lib/outputs');
const { setLocalConfig, setLocalEnv, getLocalConfig, getLocalConfigOrThrow } = require('../lib/utils');
const { ProjectAnalyzer } = require('../lib/scrapy-wrapper/src/ProjectAnalyzer');
const { wrapScrapyProject } = require('../lib/scrapy-wrapper/src');

class InitCommand extends ApifyCommand {
    async run() {
        const { args } = this.parse(InitCommand);
        let { actorName } = args;
        const cwd = process.cwd();

        if (getLocalConfig()) {
            outputs.warning(`Skipping creation of "${LOCAL_CONFIG_PATH}", the file already exists in the current directory.`);
        } else {
            if (ProjectAnalyzer.isScrapyProject(cwd)) {
                await wrapScrapyProject({ p: cwd });
            }
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

module.exports = InitCommand;
