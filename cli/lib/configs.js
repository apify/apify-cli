const os = require('os');
const path = require('path');
const fs = require('fs');

const CONFIG_FOLDER = path.join(os.homedir(), '.apify');
const CONFIG_NAEM = 'config.json';
const CONFIG_FILE = path.join(CONFIG_FOLDER, CONFIG_NAEM);
const LOCAL_CONFIG_NAME = 'apify.json';

module.exports.getConfig = async () => {
    if (!fs.existsSync(CONFIG_FOLDER) || !fs.existsSync(CONFIG_FILE)) {
        console.log('You have to login using "apify login"');
        return;
    }
    const config = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(config);
};

module.exports.setConfig = async (credentials) => {
    //TODO check if credentials work
    if(!fs.existsSync(CONFIG_FOLDER)) {
        fs.mkdirSync(CONFIG_FOLDER);
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(credentials));
    console.log('Logged into Apify!');
};

module.exports.getLocalConfig = async () => {
    const localConfigPath = path.join(process.cwd(), LOCAL_CONFIG_NAME);
    if (!fs.existsSync(localConfigPath)) {
        console.log('Local config is missing!');
        // TODO fix next steps
        return;
    }
    const localConfig = JSON.parse(fs.readFileSync(localConfigPath, 'utf-8'));
    localConfig.versions = [
        {
            "versionNumber": "0.0",
            "envVars": [],
            "sourceType": "SOURCE_CODE",
            "sourceCode": fs.readFileSync(path.join(process.cwd(), 'main.js'), 'utf-8'),
            "baseDockerImage": "apify/actor-node-basic",
            "applyEnvVarsToBuild": false,
            "buildTag": "latest"
        }
    ];
    return localConfig;
};

module.exports.setLocalConfig = async (localConfig, actDir) => {
    actDir = actDir || process.cwd();
    fs.writeFileSync(path.join(actDir, LOCAL_CONFIG_NAME), JSON.stringify(localConfig));
};

module.exports.getLocalInput = async () => {
    const localInput = path.join(process.cwd(), 'kvs-local', 'INPUT');
    if (!fs.existsSync(localInput)) return;
    return (fs.existsSync(localInput)) ? fs.readFileSync(localInput, 'utf-8') : null;
};
