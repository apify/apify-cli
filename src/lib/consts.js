const os = require('os');
const path = require('path');
const { KEY_VALUE_STORE_KEYS, META_ORIGINS } = require('@apify/consts');

exports.DEFAULT_LOCAL_STORAGE_DIR = 'storage';

exports.LEGACY_LOCAL_STORAGE_DIR = 'apify_storage';

exports.ACTOR_SPECIFICATION_VERSION = 1;

exports.EMPTY_LOCAL_CONFIG = {
    actorSpecification: exports.ACTOR_SPECIFICATION_VERSION,
    name: null,
    version: '0.0',
    buildTag: 'latest',
    environmentVariables: {},
};

exports.LANGUAGE = {
    NODEJS: 'nodejs',
    PYTHON: 'python',
    UNKNOWN: 'n/a',
};

exports.COMMANDS_WITHIN_ACTOR = ['init', 'run', 'push', 'pull', 'call'];

exports.CHECK_VERSION_EVERY_MILLIS = 24 * 60 * 60 * 1000; // Once a day

exports.GLOBAL_CONFIGS_FOLDER = path.join(os.homedir(), '.apify');

exports.AUTH_FILE_PATH = path.join(exports.GLOBAL_CONFIGS_FOLDER, 'auth.json');

exports.SECRETS_FILE_PATH = path.join(exports.GLOBAL_CONFIGS_FOLDER, 'secrets.json');

exports.STATE_FILE_PATH = path.join(exports.GLOBAL_CONFIGS_FOLDER, 'state.json');

exports.TELEMETRY_FILE_PATH = path.join(exports.GLOBAL_CONFIGS_FOLDER, 'telemetry.json');

exports.DEPRECATED_LOCAL_CONFIG_NAME = 'apify.json';

exports.ACTOR_SPECIFICATION_FOLDER = '.actor';

exports.LOCAL_CONFIG_NAME = 'actor.json';

exports.LOCAL_CONFIG_PATH = path.join(exports.ACTOR_SPECIFICATION_FOLDER, exports.LOCAL_CONFIG_NAME);

exports.INPUT_FILE_REG_EXP = new RegExp(`^${KEY_VALUE_STORE_KEYS.INPUT}\\..*`);

exports.MAIN_FILE = 'main.js';

exports.UPLOADS_STORE_NAME = 'apify-cli-deployments';

exports.SUPPORTED_NODEJS_VERSION = require('../../package.json').engines.node; //  eslint-disable-line;

exports.APIFY_CLIENT_DEFAULT_HEADERS = { 'X-Apify-Request-Origin': META_ORIGINS.CLI };

exports.MINIMUM_SUPPORTED_PYTHON_VERSION = '3.8.0';

exports.PYTHON_VENV_PATH = '.venv';

exports.MIXPANEL_TOKEN = 'ea75e434d4b4d2405d79ed9d14bfc93b';
