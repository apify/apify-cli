const os = require('os');
const path = require('path');
const fs = require('fs');
const ApifyClient = require('apify-client');

const GLOBAL_CONFIGS_FOLDER = path.join(os.homedir(), '.apify');
const AUTH_FILE_PATH = path.join(GLOBAL_CONFIGS_FOLDER, 'auth.json');
const LOCAL_CONFIG_NAME = 'apify.json';

module.exports.getLocalAuth = async () => {
    if (!fs.existsSync(GLOBAL_CONFIGS_FOLDER) || !fs.existsSync(AUTH_FILE_PATH)) {
        console.log('You have to login using "apify login"');
        return;
    }
    const auth = fs.readFileSync(AUTH_FILE_PATH, 'utf-8');
    return JSON.parse(auth);
};

module.exports.setLocalAuth = async (token, userId) => {
    if (!fs.existsSync(GLOBAL_CONFIGS_FOLDER)) {
        fs.mkdirSync(GLOBAL_CONFIGS_FOLDER);
    }
    const auth = {
        token,
        userId
    };
    // TODO: Use endpoint for get auth only with token
    const apifyClient = new ApifyClient(auth);
    await apifyClient.crawlers.listCrawlers(); // Check if token works
    fs.writeFileSync(AUTH_FILE_PATH, JSON.stringify(auth));
};

module.exports.removeGlobalConfig = async () => {
    fs.rmdirSync(GLOBAL_CONFIGS_FOLDER)
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
