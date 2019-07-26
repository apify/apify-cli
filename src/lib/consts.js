const os = require('os');
const path = require('path');
const _ = require('underscore');
const { KEY_VALUE_STORE_KEYS } = require('apify-shared/consts');

// TODO: The templates should go to apify-shared, and the JSON with all info should be generated from the directories and files in the template dir,
// the name and description should be taken from package.json files in those dirs so that we edit it in a single location!
// BTW the templates should be clustered by languages, now we have only JS but we'll add other languages later.
exports.ACTS_TEMPLATES = {
    hello_world: {
        name: 'Hello world - The smallest actor you will see today, it only takes input and generates output',
        value: 'hello_world',
        dir: `${__dirname}/../templates/hello_world`,
        defaultRunOptions: {
            build: 'latest',
            timeoutSecs: 0,
            memoryMbytes: 256,
        },
        skipOptionalDeps: true,
    },
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
    puppeteer_single_page: {
        name: 'Puppeteer single page - Load a single web page using Chrome and Puppeteer and extract data from it',
        value: 'puppeteer_single_page',
        dir: `${__dirname}/../templates/puppeteer_single_page`,
        defaultRunOptions: {
            build: 'latest',
            timeoutSecs: 0,
            memoryMbytes: 2048,
        },
    },
    cheerio_crawler: {
        name: 'Cheerio crawler - Recursively crawl a website using raw HTTP requests and Cheerio HTML parser',
        value: 'cheerio_crawler',
        dir: `${__dirname}/../templates/cheerio_crawler`,
        defaultRunOptions: {
            build: 'latest',
            timeoutSecs: 3600,
            memoryMbytes: 512,
        },
        skipOptionalDeps: true,
    },
    basic_crawler: {
        name: 'Basic crawler - Crawl a list of URLs using raw HTTP requests and Cheerio HTML parser',
        value: 'basic_crawler',
        dir: `${__dirname}/../templates/basic_crawler`,
        defaultRunOptions: {
            build: 'latest',
            timeoutSecs: 3600,
            memoryMbytes: 512,
        },
        skipOptionalDeps: true,
    },
    // NOTE: We can use isDeprecated flag if we want to omit template from templates list which user can use for new actors.
    // But if old users have this template in apify.json, it will work.
    puppeteer: {
        isDeprecated: true,
        value: 'puppeteer',
        defaultRunOptions: {
            build: 'latest',
            timeoutSecs: 0,
            memoryMbytes: 2048,
        },
    },
    basic: {
        isDeprecated: true,
        value: 'basic',
        defaultRunOptions: {
            build: 'latest',
            timeoutSecs: 3600,
            memoryMbytes: 512,
        },
    },
};

exports.DEPRECATED_ACTS_TEMPLATE_LIST = Object.keys(exports.ACTS_TEMPLATES).filter(key => exports.ACTS_TEMPLATES[key].isDeprecated);

exports.ACTS_TEMPLATE_LIST = _.without(Object.keys(exports.ACTS_TEMPLATES), ...exports.DEPRECATED_ACTS_TEMPLATE_LIST);

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

