import { readFileSync, writeFileSync } from 'node:fs';

import { secretsMessages } from '#i18n/lib/secrets.js';

import { SECRETS_FILE_PATH } from './consts.js';
import { t } from './i18n/index.js';
import { logger } from './logger.js';
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

	if (secrets[name]) throw new Error(t(secretsMessages.secretAlreadyExists, { name }));
	if (typeof name !== 'string' || name.length > MAX_ENV_VAR_NAME_LENGTH) {
		throw new Error(t(secretsMessages.secretNameTooLong, { maxLength: MAX_ENV_VAR_NAME_LENGTH }));
	}
	if (typeof value !== 'string' || value.length > MAX_ENV_VAR_VALUE_LENGTH) {
		throw new Error(t(secretsMessages.secretValueTooLong, { maxLength: MAX_ENV_VAR_VALUE_LENGTH }));
	}

	secrets[name] = value;
	return writeSecretsFile(secrets);
};

export const removeSecret = (name: string) => {
	const secrets = getSecretsFile();
	if (!secrets[name]) throw new Error(t(secretsMessages.secretNotFound, { name }));
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
export const replaceSecretsValue = (
	env: Record<string, string>,
	secrets?: Record<string, string>,
	{ allowMissing = false }: { allowMissing?: boolean } = {},
) => {
	secrets = secrets || getSecretsFile();
	const updatedEnv = {};
	const missingSecrets: string[] = [];

	Object.keys(env).forEach((key) => {
		if (isSecretKey(env[key])) {
			const secretKey = env[key].replace(new RegExp(`^${SECRET_KEY_PREFIX}`), '');
			if (secrets![secretKey]) {
				// @ts-expect-error - we are replacing the value
				updatedEnv[key] = secrets[secretKey];
			} else {
				missingSecrets.push(secretKey);
			}
		} else {
			// @ts-expect-error - we are replacing the value
			updatedEnv[key] = env[key];
		}
	});

	if (missingSecrets.length > 0) {
		const secretsList = missingSecrets.map((s) => `  - ${s}`).join('\n');
		if (allowMissing) {
			for (const secretKey of missingSecrets) {
				logger.stderr.warning(t(secretsMessages.missingSecretWarning, { secretKey }));
			}
		} else {
			throw new Error(t(secretsMessages.missingSecretsList, { secretsList }));
		}
	}

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
export const transformEnvToEnvVars = (
	env: Record<string, string>,
	secrets?: Record<string, string>,
	{ allowMissing = false }: { allowMissing?: boolean } = {},
) => {
	secrets = secrets || getSecretsFile();
	const envVars: EnvVar[] = [];
	const missingSecrets: string[] = [];

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
				missingSecrets.push(secretKey);
			}
		} else {
			envVars.push({
				name: key,
				value: env[key],
			});
		}
	});

	if (missingSecrets.length > 0) {
		const secretsList = missingSecrets.map((s) => `  - ${s}`).join('\n');
		if (allowMissing) {
			for (const secretKey of missingSecrets) {
				logger.stderr.warning(t(secretsMessages.missingSecretWarning, { secretKey }));
			}
		} else {
			throw new Error(t(secretsMessages.missingSecretsList, { secretsList }));
		}
	}

	return envVars;
};
