const inquirer = require('inquirer');
const outputs = require('../utils/outputs');
const { setLocalConfig, setLocalEnv } = require('../utils/configs');
const { EMPTY_LOCAL_CONFIG } = require('../utils/consts');


module.exports = async (args) => {
    let actName = args._.shift();
    if (!actName) {
        const answer = await inquirer.prompt([{ name: 'actName', message: 'Act name:', default: __dirname }]);
        actName = answer.actName;
    }
    const cwd = process.cwd();
    await setLocalConfig(Object.assign(EMPTY_LOCAL_CONFIG, { name: actName }), cwd);
    await setLocalEnv(cwd);
    outputs.success(`Initialed act ${actName} in current dir.`);
};
