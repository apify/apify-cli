const inquirer = require('inquirer');
const outputs = require('../lib/outputs');
const { setLocalConfig, setLocalEnv } = require('../lib/configs');

module.exports = async (args) => {
    let actName = args._.shift();
    if (!actName) {
        const answer = await inquirer.prompt([{ name: 'actName', message: 'Act name:', type: 'actName' }]);
        actName = answer.actName;
    }
    const cwd = process.cwd();
    await setLocalConfig({ name: actName }, cwd);
    await setLocalEnv(cwd);
    outputs.success(`Initialed act ${actName} in current dir.`);
};
