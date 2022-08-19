const os = require('os');
const path = require('path');
const { KEY_VALUE_STORE_KEYS } = require('@apify/consts');

exports.DEFAULT_LOCAL_STORAGE_DIR = 'storage';

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

exports.SUPPORTED_NODEJS_VERSION = require('../../package.json').engines.node; //  eslint-disable-line;
