const fs = require('fs');
const path = require('path');
const copy = require('recursive-copy');
const inquirer = require('inquirer');
const execWithLog = require('../lib/exec');
const outputs = require('../lib/outputs');
const { updateLocalJSON } = require('../lib/files');
const { setLocalConfig, setLocalEnv } = require('../lib/utils');
const { ACTS_TEMPLATES, DEFAULT_ACT_TEMPLATE, EMPTY_LOCAL_CONFIG } = require('../lib/consts');

module.exports = async (args) => {
    const actName = args._.shift();
    if (!actName) {
        outputs.error('Specified act name!');
        return;
    }
    let { template } = args;
    if (!template) {
        const choices = Object.values(ACTS_TEMPLATES);
        const answer = await inquirer.prompt([{
            type: 'list',
            name: 'template',
            message: 'Which act do you want to create?',
            default: DEFAULT_ACT_TEMPLATE,
            choices,
        }]);
        ({ template } = answer);
    }
    const cwd = process.cwd();
    const actFolderDir = path.join(cwd, actName);

    // Create act structure
    fs.mkdirSync(actFolderDir);
    await copy(ACTS_TEMPLATES[template].dir, actFolderDir, { dot: true });
    await setLocalConfig(Object.assign(EMPTY_LOCAL_CONFIG, { name: actName }), actFolderDir);
    await setLocalEnv(actFolderDir);
    await updateLocalJSON(path.join(actFolderDir, 'package.json'), { name: actName });

    // Run npm install in act dir
    let cmd = 'npm install';
    if (template === ACTS_TEMPLATES.basic.value) cmd += ' --no-optional';
    outputs.run(cmd);
    await execWithLog(cmd, { cwd: actFolderDir });

    outputs.success(`Act ${actName} was created. Run it with "apify run".`);
};
