const fs = require('fs');
const path = require('path');
const shell = require('shelljs');

const initAct = (args) => {
    const pwd = process.cwd();
    if (!args.n) console.log('Specified act name with param -n like "apify acts init -n my_act"');
    const actName = args.n;
    const template = args.t || 'basic';
    const actFolderDir = path.join(pwd, actName);
    // Create structure
    fs.mkdirSync(actFolderDir);
    fs.mkdirSync(path.join(actFolderDir, 'kvs-local'));
    fs.copyFileSync(`${__dirname}/../templates/${template}/package.json`, path.join(actFolderDir, 'package.json'));
    fs.copyFileSync(`${__dirname}/../templates/${template}/main.js`, path.join(actFolderDir, 'main.js'));
    fs.copyFileSync(`${__dirname}/../templates/${template}/INPUT`, path.join(actFolderDir, 'kvs-local', 'INPUT'));
    // Install npm
    console.log('Installing npm packages ...');
    shell.exec('npm install');
    console.log(`Local act ${actName} created. Run it with "cd ${actName}" and "npm run run-local"`);
};

module.exports = (args) => {
    const action = args._.shift();
    if (action === 'init') initAct(args);
};