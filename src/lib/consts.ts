/* eslint-disable @typescript-eslint/no-duplicate-enum-values */

import { homedir } from 'node:os';
import { join } from 'node:path';

import { KEY_VALUE_STORE_KEYS, META_ORIGINS } from '@apify/consts';

import pkg from '../../package.json' with { type: 'json' };

export const DEFAULT_LOCAL_STORAGE_DIR = 'storage';

export const LEGACY_LOCAL_STORAGE_DIR = 'apify_storage';

export const ACTOR_SPECIFICATION_VERSION = 1;

export const EMPTY_LOCAL_CONFIG = {
	actorSpecification: ACTOR_SPECIFICATION_VERSION,
	name: null,
	version: '0.0',
	buildTag: 'latest',
	environmentVariables: {},
};

export const CHECK_VERSION_EVERY_MILLIS = 24 * 60 * 60 * 1000; // Once a day

export const GLOBAL_CONFIGS_FOLDER = () => {
	const base = join(homedir(), '.apify');

	if (process.env.__APIFY_INTERNAL_TEST_AUTH_PATH__) {
		return join(base, process.env.__APIFY_INTERNAL_TEST_AUTH_PATH__);
	}

	return base;
};

export const AUTH_FILE_PATH = () => join(GLOBAL_CONFIGS_FOLDER(), 'auth.json');

export const SECRETS_FILE_PATH = () => join(GLOBAL_CONFIGS_FOLDER(), 'secrets.json');

export const STATE_FILE_PATH = () => join(GLOBAL_CONFIGS_FOLDER(), 'state.json');

export const TELEMETRY_FILE_PATH = () => join(GLOBAL_CONFIGS_FOLDER(), 'telemetry.json');

export const DEPRECATED_LOCAL_CONFIG_NAME = 'apify.json';

export const ACTOR_SPECIFICATION_FOLDER = '.actor';

export const LOCAL_CONFIG_NAME = 'actor.json';

export const LOCAL_CONFIG_PATH = join(ACTOR_SPECIFICATION_FOLDER, LOCAL_CONFIG_NAME);

export const INPUT_FILE_REG_EXP = new RegExp(`(^${KEY_VALUE_STORE_KEYS.INPUT}(?:\\.[^.]+)?$)`);

export const SUPPORTED_NODEJS_VERSION = pkg.engines.node;

export const APIFY_CLIENT_DEFAULT_HEADERS = { 'X-Apify-Request-Origin': META_ORIGINS.CLI };

export const MINIMUM_SUPPORTED_PYTHON_VERSION = '3.9.0';

export const PYTHON_VENV_PATH = '.venv';

export enum CommandExitCodes {
	BuildFailed = 1,
	RunFailed = 1,
	MissingAuth = 1,

	BuildTimedOut = 2,

	BuildAborted = 3,
	RunAborted = 3,

	NoFilesToPush = 4,

	InvalidInput = 5,
	InvalidActorJson = 5,

	NotFound = 250,
	NotImplemented = 255,
}
