const os = require('os');
const path = require('path');
const _ = require('underscore');
const { KEY_VALUE_STORE_KEYS, ACTOR_TEMPLATES } = require('apify-shared/consts');

exports.DEPRECATED_ACTS_TEMPLATE_LIST = Object.keys(exports.ACTOR_TEMPLATES).filter(key => exports.ACTOR_TEMPLATES[key].isDeprecated);

exports.ACTS_TEMPLATE_LIST = _.without(Object.keys(exports.ACTOR_TEMPLATES), ...exports.DEPRECATED_ACTS_TEMPLATE_LIST);

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

exports.SUPPORTED_NODEJS_VERSION = require('../../package.json').engines.node; //  eslint-disable-line;
