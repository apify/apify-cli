const loadJson = require('load-json-file');
const writeJson = require('write-json-file');
const _ = require('underscore');
const { SECRETS_FILE_PATH } = require('./consts');

// TODO: Moved to shared
const MAX_ENV_VAR_NAME_LENGTH = 100;
const MAX_ENV_VAR_VALUE_LENGTH = 50000;

const getSecretsFile = () => {
    try {
        return loadJson.sync(SECRETS_FILE_PATH) || {};
    } catch (e) {
        return {};
    }
};

const writeSecretsFile = (secrets) => {
    writeJson.sync(SECRETS_FILE_PATH, secrets);
    return secrets;
};

const addSecret = (name, value) => {
    const secrets = getSecretsFile();

    if (secrets[name]) throw new Error(`Secret with name ${name} already exists. Call "apify secrets:rm ${name}" to remove it.`);
    if (!_.isString(name) || name.length > MAX_ENV_VAR_NAME_LENGTH) {
        throw new Error(`Secret name has to be string with maximum length ${MAX_ENV_VAR_NAME_LENGTH}.`);
    }
    if (!_.isString(value) || value.length > MAX_ENV_VAR_VALUE_LENGTH) {
        throw new Error(`Secret value has to be string with maximum length ${MAX_ENV_VAR_VALUE_LENGTH}.`);
    }

    secrets[name] = value;
    return writeSecretsFile(secrets);
};

const removeSecret = (name) => {
    const secrets = getSecretsFile();
    if (!secrets[name]) throw new Error(`Secret with name ${name} doesn't exist.`);
    delete secrets[name];
    writeSecretsFile(secrets);
};

module.exports = {
    addSecret,
    removeSecret,
};
