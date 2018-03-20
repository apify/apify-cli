const inquirer = require('inquirer');
const outputs = require('../lib/outputs');
const { setLocalConfig, setLocalEnv } = require('../lib/utils');
const { EMPTY_LOCAL_CONFIG } = require('../lib/consts');


module.exports = async (args) => {
    let actName = args._.shift();
    if (!actName) {
        const answer = await inquirer.prompt([{ name: 'actName', message: 'Act name:', default: __dirname }]);
        ({ actName } = answer);
    }
    const cwd = process.cwd();
    await setLocalConfig(Object.assign(EMPTY_LOCAL_CONFIG, { name: actName }), cwd);
    await setLocalEnv(cwd);
    outputs.success(`Initialed act ${actName} in current dir.`);
};
