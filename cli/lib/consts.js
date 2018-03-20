const os = require('os');
const path = require('path');

module.exports.ACTS_TEMPLATES = {
    basic: {
        name: 'Basic act ("basic")',
        value: 'basic',
        dir: `${__dirname}/../templates/basic`,
    },
    puppeteer: {
        name: 'Puppeteer crawler ("puppeteer")',
        value: 'puppeteer',
        dir: `${__dirname}/../templates/puppeteer`,
    },
};

module.exports.ACTS_TEMPLATE_LIST = Object.keys(module.exports.ACTS_TEMPLATES);

module.exports.DEFAULT_ACT_TEMPLATE = 'basic';

module.exports.APIFY_LOCAL_EMULATION_DIR = 'apify_local';

module.exports.APIFY_LOCAL_DATASETS_DIR = 'datasets';

module.exports.APIFY_LOCAL_KEY_VALUE_STORES_DIR = 'key-value-stores';

module.exports.APIFY_DEFAULT_KEY_VALUE_STORE_ID = 'default';

module.exports.APIFY_DEFAULT_DATASET_ID = 'default';

module.exports.EMPTY_LOCAL_CONFIG = {
    name: '',
    actId: '',
    versionNumber: '0.1',
    buildTag: 'latest',
};

module.exports.GLOBAL_CONFIGS_FOLDER = path.join(os.homedir(), '.apify');

module.exports.AUTH_FILE_PATH = path.join(module.exports.GLOBAL_CONFIGS_FOLDER, 'auth.json');

module.exports.LOCAL_CONFIG_NAME = 'apify.json';
