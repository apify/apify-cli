const os = require('os');
const path = require('path');
const { KEY_VALUE_STORE_KEYS } = require('apify-shared/consts');

// TODO: The templates should go to apify-shared, and the JSON with all info should be generated from the directories and files in the template dir,
// the name and description should be taken from package.json files in those dirs so that we edit it in a single location!
// BTW the templates should be clustered by languages, now we have only JS but we'll add other languages later.
exports.ACTS_TEMPLATES = {
    puppeteer_crawler: {
        name: 'Puppeteer crawler - Recursively crawl a website using Chrome and Puppeteer',
        value: 'puppeteer_crawler',
        dir: `${__dirname}/../templates/puppeteer_crawler`,
        defaultRunOptions: {
            build: 'latest',
            timeoutSecs: 0,
            memoryMbytes: 2048,
        },
    },
    puppeteer: {
        name: 'Puppeteer single page - Interact with a single web page using Chrome and Puppeteer',
        value: 'puppeteer',
        dir: `${__dirname}/../templates/puppeteer`,
        defaultRunOptions: {
            build: 'latest',
            timeoutSecs: 0,
            memoryMbytes: 2048,
        },
    },
    basic: {
        name: 'Minimal - The smallest actor you will see today, it only takes input and generates output',
        value: 'basic',
        dir: `${__dirname}/../templates/basic`,
        defaultRunOptions: {
            build: 'latest',
            timeoutSecs: 3600,
            memoryMbytes: 512,
        },
    },
    hello_world: {
        name: 'Hello world - The basic example which recursively crawls a website using Chrome and Puppeteer',
        value: 'hello_world',
        dir: `${__dirname}/../templates/hello_world`,
        defaultRunOptions: {
            build: 'latest',
            timeoutSecs: 0,
            memoryMbytes: 2048,
        },
    },
};

exports.ACTS_TEMPLATE_LIST = Object.keys(exports.ACTS_TEMPLATES);

exports.DEFAULT_ACT_TEMPLATE = 'hello_world';

exports.DEFAULT_LOCAL_STORAGE_DIR = 'apify_storage';

exports.EMPTY_LOCAL_CONFIG = {
    name: null,
    version: '0.0',
    buildTag: 'latest',
    env: null,
};

exports.GLOBAL_CONFIGS_FOLDER = path.join(os.homedir(), '.apify');

exports.AUTH_FILE_PATH = path.join(exports.GLOBAL_CONFIGS_FOLDER, 'auth.json');

exports.SECRETS_FILE_PATH = path.join(exports.GLOBAL_CONFIGS_FOLDER, 'secrets.json');

exports.LOCAL_CONFIG_NAME = 'apify.json';

exports.INPUT_FILE_REG_EXP = new RegExp(`^${KEY_VALUE_STORE_KEYS.INPUT}\\..*`);

exports.MAIN_FILE = 'main.js';

exports.UPLOADS_STORE_NAME = 'apify-cli-deployments';

