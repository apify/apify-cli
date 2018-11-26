const loadJson = require('load-json-file');
const writeJson = require('write-json-file');
const _ = require('underscore');
const { SECRETS_FILE_PATH } = require('./consts');
const { warning } = require('./outputs');

const SECRET_KEY_PREFIX = '@';
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

const isSecretKey = (envValue) => {
    return new RegExp(`^${SECRET_KEY_PREFIX}.{1}`).test(envValue);
};

/**
 * Replaces secure values in env with proper values from local secrets file.
 * @param env
 * @param secrets - Object with secrets, if not set, will be load from secrets file.
 */
const replaceSecretsValue = (env, secrets) => {
    secrets = secrets || getSecretsFile();
    const updatedEnv = {};
    Object.keys(env).forEach((key) => {
        if (isSecretKey(env[key])) {
            const secretKey = env[key].replace(new RegExp(`^${SECRET_KEY_PREFIX}`), '');
            if (secrets[secretKey]) {
                updatedEnv[key] = secrets[secretKey];
            } else {
                warning(`Secrets with key ${secretKey} in local secrets. Set it up with "apify secrets:add ${secretKey} secretValue".`);
            }
        } else {
            updatedEnv[key] = env[key];
        }
    });
    return updatedEnv;
};

/**
 * Transform env to envVars format attribute, which uses Apify API
 * It replaces secrets to values from secrets file.
 * @param env
 * @param secrets - Object with secrets, if not set, will be load from secrets file.
 */
const transformEnvToEnvVars = (env, secrets) => {
    secrets = secrets || getSecretsFile();
    const envVars = [];
    Object.keys(env).forEach((key) => {
        if (isSecretKey(env[key])) {
            const secretKey = env[key].replace(new RegExp(`^${SECRET_KEY_PREFIX}`), '');
            if (secrets[secretKey]) {
                envVars.push({
                    name: key,
                    value: secrets[secretKey],
                    isSecret: true
                });
            } else {
                warning(`Secrets with key ${secretKey} in local secrets. Set it up with "apify secrets:add ${secretKey} secretValue"`);
            }
        } else {
            envVars.push({
                name: key,
                value: env[key],
            });
        }
    });
    return envVars;
};

module.exports = {
    addSecret,
    removeSecret,
    replaceSecretsValue,
    getSecretsFile,
    transformEnvToEnvVars,
};
