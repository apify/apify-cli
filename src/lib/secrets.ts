import { readFileSync, writeFileSync } from 'node:fs';

import { SECRETS_FILE_PATH } from './consts.js';
import { warning } from './outputs.js';
import { ensureApifyDirectory } from './utils.js';

const SECRET_KEY_PREFIX = '@';
// TODO: Moved to shared
const MAX_ENV_VAR_NAME_LENGTH = 100;
const MAX_ENV_VAR_VALUE_LENGTH = 50000;

export const getSecretsFile = () => {
	try {
		return JSON.parse(readFileSync(SECRETS_FILE_PATH(), 'utf-8')) || {};
	} catch {
		return {};
	}
};

const writeSecretsFile = (secrets: Record<string, string>) => {
	ensureApifyDirectory(SECRETS_FILE_PATH());
	writeFileSync(SECRETS_FILE_PATH(), JSON.stringify(secrets, null, '\t'));
	return secrets;
};

export const addSecret = (name: string, value: string) => {
	const secrets = getSecretsFile();

	if (secrets[name])
		throw new Error(`Secret with name ${name} already exists. Call "apify secrets rm ${name}" to remove it.`);
	if (typeof name !== 'string' || name.length > MAX_ENV_VAR_NAME_LENGTH) {
		throw new Error(`Secret name has to be string with maximum length ${MAX_ENV_VAR_NAME_LENGTH}.`);
	}
	if (typeof value !== 'string' || value.length > MAX_ENV_VAR_VALUE_LENGTH) {
		throw new Error(`Secret value has to be string with maximum length ${MAX_ENV_VAR_VALUE_LENGTH}.`);
	}

	secrets[name] = value;
	return writeSecretsFile(secrets);
};

export const removeSecret = (name: string) => {
	const secrets = getSecretsFile();
	if (!secrets[name]) throw new Error(`Secret with name ${name} doesn't exist.`);
	delete secrets[name];
	writeSecretsFile(secrets);
};

const isSecretKey = (envValue: string) => {
	return new RegExp(`^${SECRET_KEY_PREFIX}.{1}`).test(envValue);
};

/**
 * Replaces secure values in env with proper values from local secrets file.
 * @param env
 * @param secrets - Object with secrets, if not set, will be load from secrets file.
 */
export const replaceSecretsValue = (env: Record<string, string>, secrets?: Record<string, string>) => {
	secrets = secrets || getSecretsFile();
	const updatedEnv = {};
	Object.keys(env).forEach((key) => {
		if (isSecretKey(env[key])) {
			const secretKey = env[key].replace(new RegExp(`^${SECRET_KEY_PREFIX}`), '');
			if (secrets![secretKey]) {
				// @ts-expect-error - we are replacing the value
				updatedEnv[key] = secrets[secretKey];
			} else {
				warning({
					message: `Value for ${secretKey} not found in local secrets. Set it by calling "apify secrets add ${secretKey} [SECRET_VALUE]"`,
				});
			}
		} else {
			// @ts-expect-error - we are replacing the value
			updatedEnv[key] = env[key];
		}
	});
	return updatedEnv;
};

interface EnvVar {
	name: string;
	value: string;
	isSecret?: boolean;
}

/**
 * Transform env to envVars format attribute, which uses Apify API
 * It replaces secrets to values from secrets file.
 * @param secrets - Object with secrets, if not set, will be load from secrets file.
 */
export const transformEnvToEnvVars = (env: Record<string, string>, secrets?: Record<string, string>) => {
	secrets = secrets || getSecretsFile();
	const envVars: EnvVar[] = [];
	Object.keys(env).forEach((key) => {
		if (isSecretKey(env[key])) {
			const secretKey = env[key].replace(new RegExp(`^${SECRET_KEY_PREFIX}`), '');
			if (secrets![secretKey]) {
				envVars.push({
					name: key,
					value: secrets![secretKey],
					isSecret: true,
				});
			} else {
				warning({
					message: `Value for ${secretKey} not found in local secrets. Set it by calling "apify secrets add ${secretKey} [SECRET_VALUE]"`,
				});
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
