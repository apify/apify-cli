const os = require('os');
const path = require('path');
const { DEFAULT_LOCAL_EMULATION_DIR, ENV_VARS,
    DEFAULT_PROXY_HOSTNAME, DEFAULT_PROXY_PORT,
    LOCAL_EMULATION_SUBDIRS, KEY_VALUE_STORE_KEYS } = require('apify-shared/consts');

// TODO: The templates should go to apify-shared, and the JSON with all info should be generated from the directories and files in the template dir,
// the name and description should be taken from package.json files in those dirs so that we edit it in a single location!
// BTW the templates should be clustered by languages, now we have only JS but we'll add other languages later.
exports.ACTS_TEMPLATES = {
    basic: {
        name: 'Basic ("basic")',
        value: 'basic',
        dir: `${__dirname}/../templates/basic`,
        defaultRunOptions: {
            build: 'latest',
            timeoutSecs: 3600,
            memoryMbytes: 512,
        },
    },
    puppeteer: {
        name: 'Puppeteer ("puppeteer")',
        value: 'puppeteer',
        dir: `${__dirname}/../templates/puppeteer`,
        defaultRunOptions: {
            build: 'latest',
            timeoutSecs: 0,
            memoryMbytes: 2048,
        },
    },
    puppeteer_crawler: {
        name: 'Puppeteer crawler ("puppeteer_crawler")',
        value: 'puppeteer_crawler',
        dir: `${__dirname}/../templates/puppeteer_crawler`,
        defaultRunOptions: {
            build: 'latest',
            timeoutSecs: 0,
            memoryMbytes: 2048,
        },
    },
    plain_request_urls_list: {
        name: 'Plain request url list crawler ("plain_request_urls_list")',
        value: 'plain_request_urls_list',
        dir: `${__dirname}/../templates/plain_request_urls_list`,
        defaultRunOptions: {
            build: 'latest',
            timeoutSecs: 0,
            memoryMbytes: 2048,
        },
    },
};

exports.ACTS_TEMPLATE_LIST = Object.keys(exports.ACTS_TEMPLATES);

exports.DEFAULT_ACT_TEMPLATE = 'basic';

exports.DEFAULT_LOCAL_STORES_ID = 'default';

exports.LOCAL_ENV_VARS = {
    [ENV_VARS.LOCAL_EMULATION_DIR]: DEFAULT_LOCAL_EMULATION_DIR,
    [ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID]: exports.DEFAULT_LOCAL_STORES_ID,
    [ENV_VARS.DEFAULT_DATASET_ID]: exports.DEFAULT_LOCAL_STORES_ID,
    [ENV_VARS.DEFAULT_REQUEST_QUEUE_ID]: exports.DEFAULT_LOCAL_STORES_ID,
    [ENV_VARS.PROXY_HOSTNAME]: DEFAULT_PROXY_HOSTNAME,
    [ENV_VARS.PROXY_PORT]: DEFAULT_PROXY_PORT.toString(),
};

exports.EMPTY_LOCAL_CONFIG = {
    name: null,
    actId: null,
    version: {
        versionNumber: '0.1',
        buildTag: 'latest',
        envVars: [],
        sourceType: 'TARBALL',
        tarballUrl: null,
    },
};

exports.GLOBAL_CONFIGS_FOLDER = path.join(os.homedir(), '.apify');

exports.AUTH_FILE_PATH = path.join(exports.GLOBAL_CONFIGS_FOLDER, 'auth.json');

exports.LOCAL_CONFIG_NAME = 'apify.json';

exports.INPUT_FILE_REG_EXP = new RegExp(`^${KEY_VALUE_STORE_KEYS.INPUT}\\..*`);
