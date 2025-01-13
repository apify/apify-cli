import { type SpawnSyncOptions, spawnSync } from 'node:child_process';
import {
	createWriteStream,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	renameSync,
	writeFileSync,
} from 'node:fs';
import type { IncomingMessage } from 'node:http';
import { get } from 'node:https';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { finished } from 'node:stream/promises';

import {
	ACTOR_ENV_VARS,
	ACTOR_JOB_TERMINAL_STATUSES,
	ACTOR_NAME,
	APIFY_ENV_VARS,
	KEY_VALUE_STORE_KEYS,
	LOCAL_ACTOR_ENV_VARS,
	LOCAL_STORAGE_SUBDIRS,
	SOURCE_FILE_FORMATS,
} from '@apify/consts';
import { DurationFormatter as SapphireDurationFormatter, TimeTypes } from '@sapphire/duration';
import { Timestamp } from '@sapphire/timestamp';
import AdmZip from 'adm-zip';
import _Ajv from 'ajv';
import { type ActorRun, ApifyClient, type ApifyClientOptions, type Build } from 'apify-client';
import archiver from 'archiver';
import { AxiosHeaders } from 'axios';
import escapeStringRegexp from 'escape-string-regexp';
import { globby } from 'globby';
import inquirer from 'inquirer';
import { getEncoding } from 'istextorbinary';
import { loadJsonFile, loadJsonFileSync } from 'load-json-file';
import { Mime } from 'mime';
import otherMimes from 'mime/types/other.js';
import standardMimes from 'mime/types/standard.js';
import { gte, minVersion, satisfies } from 'semver';
import _ from 'underscore';
import { writeJsonFile, writeJsonFileSync } from 'write-json-file';

import {
	ACTOR_SPECIFICATION_VERSION,
	APIFY_CLIENT_DEFAULT_HEADERS,
	AUTH_FILE_PATH,
	DEFAULT_LOCAL_STORAGE_DIR,
	DEPRECATED_LOCAL_CONFIG_NAME,
	GLOBAL_CONFIGS_FOLDER,
	INPUT_FILE_REG_EXP,
	LANGUAGE,
	LOCAL_CONFIG_PATH,
	type Language,
	MINIMUM_SUPPORTED_PYTHON_VERSION,
	PROJECT_TYPES,
	SUPPORTED_NODEJS_VERSION,
} from './consts.js';
import { deleteFile, ensureFolderExistsSync, rimrafPromised } from './files.js';
import { info } from './outputs.js';
import { ProjectAnalyzer } from './project_analyzer.js';
import type { AuthJSON } from './types.js';

// Export AJV properly: https://github.com/ajv-validator/ajv/issues/2132
// Welcome to the state of JavaScript/TypeScript and CJS/ESM interop.
export const Ajv = _Ajv as unknown as typeof import('ajv').default;

export const httpsGet = async (url: string) => {
	return new Promise<IncomingMessage>((resolve, reject) => {
		get(url, (response) => {
			// Handle redirects
			if (response.statusCode === 301 || response.statusCode === 302) {
				resolve(httpsGet(response.headers.location!));
				// Destroy the response to close the HTTP connection, otherwise this hangs for a long time with Node 19+ (due to HTTP keep-alive).
				response.destroy();
			} else {
				resolve(response);
			}
		}).on('error', reject);
	});
};

// Properties from apify.json file that will me migrated to Actor specs in .actor/actor.json
const MIGRATED_APIFY_JSON_PROPERTIES = ['name', 'version', 'buildTag'];

export const getLocalStorageDir = () => {
	const envVar = APIFY_ENV_VARS.LOCAL_STORAGE_DIR;

	return process.env[envVar] || process.env.CRAWLEE_STORAGE_DIR || DEFAULT_LOCAL_STORAGE_DIR;
};

export const getLocalKeyValueStorePath = (storeId?: string) => {
	const envVar = ACTOR_ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID;
	const storeDir = storeId || process.env[envVar] || LOCAL_ACTOR_ENV_VARS[envVar];

	return join(getLocalStorageDir(), LOCAL_STORAGE_SUBDIRS.keyValueStores, storeDir);
};

export const getLocalDatasetPath = (storeId?: string) => {
	const envVar = ACTOR_ENV_VARS.DEFAULT_DATASET_ID;
	const storeDir = storeId || process.env[envVar] || LOCAL_ACTOR_ENV_VARS[envVar];

	return join(getLocalStorageDir(), LOCAL_STORAGE_SUBDIRS.datasets, storeDir);
};

export const getLocalRequestQueuePath = (storeId?: string) => {
	const envVar = ACTOR_ENV_VARS.DEFAULT_REQUEST_QUEUE_ID;
	const storeDir = storeId || process.env[envVar] || LOCAL_ACTOR_ENV_VARS[envVar];

	return join(getLocalStorageDir(), LOCAL_STORAGE_SUBDIRS.requestQueues, storeDir);
};

/**
 * Returns object from auth file or empty object.
 */
export const getLocalUserInfo = async (): Promise<AuthJSON> => {
	let result: AuthJSON = {};
	try {
		result = await loadJsonFile<AuthJSON>(AUTH_FILE_PATH());
	} catch {
		return {};
	}

	if (!result.username && !result.id) {
		throw new Error('Corrupted local user info was found. Please run "apify login" to fix it.');
	}

	return result;
};

/**
 * Gets instance of ApifyClient for user otherwise throws error
 */
export const getLoggedClientOrThrow = async () => {
	const loggedClient = await getLoggedClient();

	if (!loggedClient) {
		throw new Error('You are not logged in with your Apify account. Call "apify login" to fix that.');
	}

	return loggedClient;
};

const getTokenWithAuthFileFallback = (existingToken?: string) => {
	if (!existingToken && existsSync(GLOBAL_CONFIGS_FOLDER()) && existsSync(AUTH_FILE_PATH())) {
		return loadJsonFileSync<AuthJSON>(AUTH_FILE_PATH()).token;
	}

	return existingToken;
};

// biome-ignore format: off
type CJSAxiosHeaders = import('axios', { with: { 'resolution-mode': 'require' } }).AxiosRequestConfig['headers'];

/**
 * Returns options for ApifyClient
 */
export const getApifyClientOptions = (token?: string, apiBaseUrl?: string): ApifyClientOptions => {
	token = getTokenWithAuthFileFallback(token);

	return {
		token,
		baseUrl: apiBaseUrl || process.env.APIFY_CLIENT_BASE_URL,
		requestInterceptors: [
			(config) => {
				config.headers ??= new AxiosHeaders() as CJSAxiosHeaders;

				for (const [key, value] of Object.entries(APIFY_CLIENT_DEFAULT_HEADERS)) {
					config.headers![key] = value;
				}

				return config;
			},
		],
	};
};

/**
 * Gets instance of ApifyClient for token or for params from global auth file.
 * NOTE: It refreshes global auth file each run
 * @param [token]
 */
export const getLoggedClient = async (token?: string, apiBaseUrl?: string) => {
	token = getTokenWithAuthFileFallback(token);

	const apifyClient = new ApifyClient(getApifyClientOptions(token, apiBaseUrl));

	let userInfo;
	try {
		userInfo = await apifyClient.user('me').get();
	} catch (err) {
		return null;
	}

	// Always refresh Auth file
	ensureApifyDirectory(AUTH_FILE_PATH());

	await writeJsonFile(AUTH_FILE_PATH(), { token: apifyClient.token, ...userInfo });

	return apifyClient;
};

const getLocalConfigPath = (cwd: string) => join(cwd, LOCAL_CONFIG_PATH);

/**
 * @deprecated Use getLocalConfigPath
 */
const getDeprecatedLocalConfigPath = (cwd: string) => join(cwd, DEPRECATED_LOCAL_CONFIG_NAME);

export const getJsonFileContent = <T = Record<string, unknown>>(filePath: string) => {
	if (!existsSync(filePath)) {
		return;
	}

	return loadJsonFileSync<T>(filePath);
};

export const getLocalConfig = (cwd: string) => getJsonFileContent(getLocalConfigPath(cwd));

/**
 * @deprecated Use getLocalConfig
 */
const getDeprecatedLocalConfig = (cwd: string) => getJsonFileContent(getDeprecatedLocalConfigPath(cwd));

export const getLocalConfigOrThrow = async (cwd: string) => {
	let localConfig: Record<string, unknown> | undefined;

	try {
		localConfig = getLocalConfig(cwd);
	} catch (error) {
		throw new Error(`Failed to read local config at path: '${LOCAL_CONFIG_PATH}':`, { cause: error });
	}

	let deprecatedLocalConfig: Record<string, unknown> | undefined;

	try {
		deprecatedLocalConfig = getDeprecatedLocalConfig(cwd);
	} catch (error) {
		throw new Error(`Failed to read local config at path: '${DEPRECATED_LOCAL_CONFIG_NAME}':`, { cause: error });
	}

	if (localConfig && deprecatedLocalConfig) {
		const answer = await inquirer.prompt([
			{
				name: 'isConfirm',
				type: 'confirm',

				message: `The new version of Apify CLI uses the "${LOCAL_CONFIG_PATH}" instead of the "apify.json" file. Since we have found both files in your Actor directory, "apify.json" will be renamed to "apify.json.deprecated". Going forward, all commands will use "${LOCAL_CONFIG_PATH}". You can read about the differences between the old and the new config at https://github.com/apify/apify-cli/blob/master/MIGRATIONS.md. Do you want to continue?`,
			},
		]);

		if (!answer.isConfirm) {
			throw new Error(
				'Command can not run with old "apify.json" file present in your Actor directory., Please, either rename or remove it.',
			);
		}
		try {
			renameSync(getDeprecatedLocalConfigPath(cwd), `${getDeprecatedLocalConfigPath(cwd)}.deprecated`);

			info({
				message: `The "apify.json" file has been renamed to "apify.json.deprecated". The deprecated file is no longer used by the CLI or Apify Console. If you do not need it for some specific purpose, it can be safely deleted.`,
			});
		} catch (e) {
			throw new Error('Failed to rename deprecated "apify.json".');
		}
	}

	if (!localConfig && !deprecatedLocalConfig) {
		return {};
	}

	// If apify.json exists migrate it to .actor/actor.json
	if (!localConfig && deprecatedLocalConfig) {
		const answer = await inquirer.prompt([
			{
				name: 'isConfirm',
				type: 'confirm',

				message: `The new version of Apify CLI uses the "${LOCAL_CONFIG_PATH}" instead of the "apify.json" file. Your "apify.json" file will be automatically updated to the new format under "${LOCAL_CONFIG_PATH}". The original file will be renamed by adding the ".deprecated" suffix. Do you want to continue?`,
			},
		]);
		if (!answer.isConfirm) {
			throw new Error(
				'Command can not run with old apify.json structure. Either let the CLI auto-update it or follow the guide on https://github.com/apify/apify-cli/blob/master/MIGRATIONS.md and update it manually.',
			);
		}
		try {
			// Check if apify.json contains old deprecated structure. If so, updates it.
			if (_.isObject(deprecatedLocalConfig.version)) {
				deprecatedLocalConfig = updateLocalConfigStructure(deprecatedLocalConfig);
			}

			localConfig = {
				actorSpecification: ACTOR_SPECIFICATION_VERSION,
				environmentVariables: deprecatedLocalConfig?.env || undefined,
				..._.pick(deprecatedLocalConfig, MIGRATED_APIFY_JSON_PROPERTIES),
			};

			await writeJsonFile(getLocalConfigPath(cwd), localConfig);
			renameSync(getDeprecatedLocalConfigPath(cwd), `${getDeprecatedLocalConfigPath(cwd)}.deprecated`);

			info({
				message: `The "apify.json" file has been migrated to "${LOCAL_CONFIG_PATH}" and the original file renamed to "apify.json.deprecated". The deprecated file is no longer used by the CLI or Apify Console. If you do not need it for some specific purpose, it can be safely deleted. Do not forget to commit the new file to your Git repository.`,
			});
		} catch (e) {
			throw new Error(
				`Can not update "${LOCAL_CONFIG_PATH}" structure. Follow guide on https://github.com/apify/apify-cli/blob/master/MIGRATIONS.md and update it manually.`,
			);
		}
	}

	return localConfig;
};

export const setLocalConfig = async (localConfig: Record<string, unknown>, actDir?: string) => {
	actDir = actDir || process.cwd();
	writeJsonFileSync(join(actDir, LOCAL_CONFIG_PATH), localConfig);
};

const GITIGNORE_REQUIRED_CONTENTS = [getLocalStorageDir(), 'node_modules', '.venv'];

export const setLocalEnv = async (actDir: string) => {
	// Create folders for emulation Apify stores
	const keyValueStorePath = getLocalKeyValueStorePath();
	ensureFolderExistsSync(actDir, getLocalDatasetPath());
	ensureFolderExistsSync(actDir, getLocalRequestQueuePath());
	ensureFolderExistsSync(actDir, keyValueStorePath);

	// Create or update gitignore
	const gitignorePath = join(actDir, '.gitignore');
	let gitignoreContents = '';
	if (existsSync(gitignorePath)) {
		gitignoreContents = readFileSync(gitignorePath, { encoding: 'utf-8' });
	}

	const gitignoreAdditions = [];
	for (const gitignoreRequirement of GITIGNORE_REQUIRED_CONTENTS) {
		if (!RegExp(`^${escapeStringRegexp(gitignoreRequirement)}$`, 'mg').test(gitignoreContents)) {
			gitignoreAdditions.push(gitignoreRequirement);
		}
	}

	if (gitignoreAdditions.length > 0) {
		if (gitignoreContents.length > 0) {
			gitignoreAdditions.unshift('# Added by Apify CLI');
			writeFileSync(gitignorePath, `\n${gitignoreAdditions.join('\n')}\n`, { flag: 'a' });
		} else {
			writeFileSync(gitignorePath, `${gitignoreAdditions.join('\n')}\n`, { flag: 'w' });
		}
	}
};

// Adapted from https://gist.github.com/kuroski/9a7ae8e5e5c9e22985364d1ddbf3389d to support kebab-case
type CamelCase<S extends string> = S extends `${infer P1}-${infer P2}${infer P3}` | `${infer P1}_${infer P2}${infer P3}`
	? `${Lowercase<P1>}${Uppercase<P2>}${CamelCase<Lowercase<P3>>}`
	: S;

export type KeysToCamelCase<T> = {
	[K in keyof T as CamelCase<string & K>]: T[K];
};

/**
 * Convert Object with kebab-case keys to camelCased keys
 */
export const argsToCamelCase = <T extends object>(object: T): KeysToCamelCase<T> => {
	const camelCasedObject = {} as KeysToCamelCase<T>;

	Object.keys(object).forEach((arg) => {
		const camelCasedArg = arg.replace(/-(.)/g, ($1) => $1.toUpperCase()).replace(/-/g, '');
		// @ts-expect-error This is very hard to make stricter than it already will be at the top level
		camelCasedObject[camelCasedArg] = object[arg];
	});

	return camelCasedObject;
};

const mime = new Mime(standardMimes, otherMimes).define(
	{
		// .tgz files don't have a MIME type defined, this fixes it
		'application/gzip': ['tgz'],
		// Default mime-type for .ts(x) files is video/mp2t. But in our usecases they're almost always TypeScript, which we want to treat as text
		'text/typescript': ['ts', 'tsx', 'mts'],
	},
	true,
);

// Detect whether file is binary from its MIME type, or if not available, contents
const getSourceFileFormat = (filePath: string, fileContent: Buffer) => {
	// Try to detect the MIME type from the file path
	const contentType = mime.getType(filePath);
	if (contentType) {
		const format =
			contentType.startsWith('text/') ||
			contentType.includes('javascript') ||
			contentType.includes('json') ||
			contentType.includes('xml') ||
			contentType.includes('application/node') || // .cjs files
			contentType.includes('application/toml') || // for example pyproject.toml files
			contentType.includes('application/x-httpd-php') // .php files
				? SOURCE_FILE_FORMATS.TEXT
				: SOURCE_FILE_FORMATS.BASE64;

		return format;
	}

	// If the MIME type detection failed, try to detect the file encoding from the file content
	const encoding = getEncoding(fileContent);
	return encoding === 'binary' ? SOURCE_FILE_FORMATS.BASE64 : SOURCE_FILE_FORMATS.TEXT;
};

export const createSourceFiles = async (paths: string[], cwd: string) => {
	return paths.map((filePath) => {
		const file = readFileSync(join(cwd, filePath));
		const format = getSourceFileFormat(filePath, file);
		return {
			name: filePath,
			format,
			content: format === SOURCE_FILE_FORMATS.TEXT ? file.toString('utf8') : file.toString('base64'),
		};
	});
};

/**
 * Get Actor local files, omit files defined in .gitignore and .git folder
 * All dot files(.file) and folders(.folder/) are included.
 */
export const getActorLocalFilePaths = async (cwd?: string) =>
	globby(['*', '**/**'], {
		ignore: ['.git/**', 'apify_storage', 'node_modules', 'storage', 'crawlee_storage'],
		gitignore: true,
		dot: true,
		cwd,
	});

/**
 * Create zip file with all Actor files specified with pathsToZip
 */
export const createActZip = async (zipName: string, pathsToZip: string[], cwd: string) => {
	// NOTE: There can be a zip from a previous unfinished operation.
	if (existsSync(zipName)) {
		await deleteFile(zipName);
	}

	const writeStream = createWriteStream(zipName);
	const archive = archiver('zip');
	archive.pipe(writeStream);

	pathsToZip.forEach((globPath) => archive.glob(globPath, { cwd }));

	await archive.finalize();
};

/**
 * Get Actor input from local store
 */
export const getLocalInput = (cwd: string) => {
	const defaultLocalStorePath = getLocalKeyValueStorePath();

	const folderExists = existsSync(join(cwd, defaultLocalStorePath));

	if (!folderExists) return;

	const files = readdirSync(join(cwd, defaultLocalStorePath));
	const inputName = files.find((file) => !!file.match(INPUT_FILE_REG_EXP));

	// No input file
	if (!inputName) return;

	const input = readFileSync(join(cwd, defaultLocalStorePath, inputName));
	const contentType = mime.getType(inputName);
	return { body: input, contentType, fileName: inputName };
};

export const purgeDefaultQueue = async () => {
	const defaultQueuesPath = getLocalRequestQueuePath();
	if (existsSync(getLocalStorageDir()) && existsSync(defaultQueuesPath)) {
		await rimrafPromised(defaultQueuesPath);
	}
};

export const purgeDefaultDataset = async () => {
	const defaultDatasetPath = getLocalDatasetPath();
	if (existsSync(getLocalStorageDir()) && existsSync(defaultDatasetPath)) {
		await rimrafPromised(defaultDatasetPath);
	}
};

export const purgeDefaultKeyValueStore = async () => {
	const defaultKeyValueStorePath = getLocalKeyValueStorePath();
	if (!existsSync(getLocalStorageDir()) || !existsSync(defaultKeyValueStorePath)) {
		return;
	}
	const filesToDelete = readdirSync(defaultKeyValueStorePath);

	const deletePromises: Promise<void>[] = [];
	filesToDelete.forEach((file) => {
		if (!file.match(INPUT_FILE_REG_EXP)) {
			deletePromises.push(deleteFile(join(defaultKeyValueStorePath, file)));
		}
	});

	await Promise.all(deletePromises);
};

export const outputJobLog = async (job: ActorRun | Build, timeout?: number) => {
	const { id: logId, status } = job;
	const apifyClient = new ApifyClient({ baseUrl: process.env.APIFY_CLIENT_BASE_URL });

	// In case job was already done just output log
	if (ACTOR_JOB_TERMINAL_STATUSES.includes(status as never)) {
		if (process.env.APIFY_NO_LOGS_IN_TESTS) {
			return;
		}

		const log = await apifyClient.log(logId).get();
		process.stderr.write(log!);
		return;
	}

	// In other case stream it to stderr
	// eslint-disable-next-line no-async-promise-executor
	return new Promise<'no-logs' | 'finished' | 'timeouts'>(async (resolve) => {
		const stream = await apifyClient.log(logId).stream();

		if (!stream) {
			resolve('no-logs');
			return;
		}

		let nodeTimeout: NodeJS.Timeout | null = null;

		stream.on('data', (chunk) => {
			// In tests, writing to process.stderr directly messes with vitest's output
			// With that said, we still NEED to wait for this stream to end, as otherwise tests become flaky.
			if (process.env.APIFY_NO_LOGS_IN_TESTS) {
				return;
			}

			process.stderr.write(chunk.toString());
		});

		stream.once('end', () => {
			resolve('finished');

			if (nodeTimeout) {
				clearTimeout(nodeTimeout);
			}
		});

		if (timeout) {
			nodeTimeout = setTimeout(() => {
				stream.destroy();
				resolve('timeouts');
			}, timeout);
		}
	});
};

/**
 * Returns npm command for current os
 * NOTE: For window we have to returns npm.cmd instead of npm, otherwise it doesn't work
 */
export const getNpmCmd = (): string => {
	return /^win/.test(process.platform) ? 'npm.cmd' : 'npm';
};

/**
 * Returns true if apify storage is empty (expect INPUT.*)
 */
export const checkIfStorageIsEmpty = async () => {
	const filesWithoutInput = await globby([
		`${getLocalStorageDir()}/**`,
		// Omit INPUT.* file
		`!${getLocalKeyValueStorePath()}/${KEY_VALUE_STORE_KEYS.INPUT}.*`,
		// Omit INPUT_CLI-* files
		`!${getLocalKeyValueStorePath()}/${KEY_VALUE_STORE_KEYS.INPUT}_CLI-*`,
	]);

	return filesWithoutInput.length === 0;
};

/**
 * Migration for deprecated structure of apify.json to latest.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const updateLocalConfigStructure = (localConfig: any) => {
	const updatedLocalConfig: Record<string, unknown> = {
		name: localConfig.name,
		template: localConfig.template,
		version: localConfig.version.versionNumber,
		buildTag: localConfig.version.buildTag,
		env: null,
	};

	if (localConfig.version.envVars && localConfig.version.envVars.length) {
		const env = {} as Record<string, string>;
		localConfig.version.envVars.forEach((envVar: { name: string; value: string }) => {
			if (envVar.name && envVar.value) env[envVar.name] = envVar.value;
		});

		updatedLocalConfig.env = env;
	}
	return updatedLocalConfig;
};

/**
 * Validates Actor name, if finds issue throws error.
 * @param actorName
 */
export const validateActorName = (actorName: string) => {
	if (!ACTOR_NAME.REGEX.test(actorName)) {
		throw new Error('The Actor name must be a DNS hostname-friendly string (e.g. my-newest-actor).');
	}
	if (actorName.length < ACTOR_NAME.MIN_LENGTH) {
		throw new Error('The Actor name must be at least 3 characters long.');
	}
	if (actorName.length > ACTOR_NAME.MAX_LENGTH) {
		throw new Error('The Actor name must be a maximum of 30 characters long.');
	}
};

export const sanitizeActorName = (actorName: string) => {
	let sanitizedName = actorName.replaceAll(/[^a-zA-Z0-9-]/g, '-');

	if (sanitizedName.length < ACTOR_NAME.MIN_LENGTH) {
		sanitizedName = `${sanitizedName}-apify-actor`;
	}

	sanitizedName = sanitizedName.replaceAll(/^-+/g, '').replaceAll(/-+$/g, '');

	return sanitizedName.slice(0, ACTOR_NAME.MAX_LENGTH);
};

export const getPythonCommand = (directory: string) => {
	const pythonVenvPath = /^win/.test(process.platform) ? 'Scripts/python.exe' : 'bin/python3';

	let fullPythonVenvPath;
	if (process.env.VIRTUAL_ENV) {
		fullPythonVenvPath = join(process.env.VIRTUAL_ENV, pythonVenvPath);
	} else {
		fullPythonVenvPath = join(directory, '.venv', pythonVenvPath);
	}

	if (existsSync(fullPythonVenvPath)) {
		return fullPythonVenvPath;
	}

	return /^win/.test(process.platform) ? 'python' : 'python3';
};

const spawnOptions: SpawnSyncOptions = { shell: true, windowsHide: true };

export const detectPythonVersion = (directory: string) => {
	const pythonCommand = getPythonCommand(directory);
	try {
		const spawnResult = spawnSync(pythonCommand, ['-c', '"import platform; print(platform.python_version())"'], {
			...spawnOptions,
			encoding: 'utf-8',
		});

		if (!spawnResult.error && spawnResult.stdout) {
			return spawnResult.stdout.trim();
		}

		return undefined;
	} catch {
		return undefined;
	}
};

export const isPythonVersionSupported = (installedPythonVersion: string) => {
	return satisfies(installedPythonVersion, `^${MINIMUM_SUPPORTED_PYTHON_VERSION}`);
};

export const detectNodeVersion = () => {
	try {
		const spawnResult = spawnSync('node', ['--version'], {
			...spawnOptions,
			encoding: 'utf-8',
		});

		if (!spawnResult.error && spawnResult.stdout) {
			return spawnResult.stdout.trim().replace(/^v/, '');
		}

		return undefined;
	} catch {
		return undefined;
	}
};

export const isNodeVersionSupported = (installedNodeVersion: string) => {
	// SUPPORTED_NODEJS_VERSION can be a version range,
	// we need to get the minimum supported version from that range to be able to compare them
	const minimumSupportedNodeVersion = minVersion(SUPPORTED_NODEJS_VERSION)!;
	return gte(installedNodeVersion, minimumSupportedNodeVersion);
};

export const detectNpmVersion = () => {
	const npmCommand = getNpmCmd();
	try {
		const spawnResult = spawnSync(npmCommand, ['--version'], {
			...spawnOptions,
			encoding: 'utf-8',
		});

		if (!spawnResult.error && spawnResult.stdout) {
			return spawnResult.stdout.trim().replace(/^v/, '');
		}

		return undefined;
	} catch {
		return undefined;
	}
};

export interface ActorLanguage {
	language: Language;
	languageVersion?: string;
}

export const detectLocalActorLanguage = (cwd: string) => {
	const isActorInNode = existsSync(join(cwd, 'package.json'));
	const isActorInPython =
		existsSync(join(cwd, 'src/__main__.py')) || ProjectAnalyzer.getProjectType(cwd) === PROJECT_TYPES.SCRAPY;
	const result = {} as ActorLanguage;

	if (isActorInNode) {
		result.language = LANGUAGE.NODEJS;
		result.languageVersion = detectNodeVersion();
	} else if (isActorInPython) {
		result.language = LANGUAGE.PYTHON;
		result.languageVersion = detectPythonVersion(cwd);
	} else {
		result.language = LANGUAGE.UNKNOWN;
	}

	return result;
};

export const downloadAndUnzip = async ({ url, pathTo }: { url: string; pathTo: string }) => {
	const zipStream = await httpsGet(url);
	const chunks: Buffer[] = [];
	zipStream.on('data', (chunk) => chunks.push(chunk));
	await finished(zipStream);
	const zip = new AdmZip(Buffer.concat(chunks));
	zip.extractAllTo(pathTo, true);
};

/**
 * Ensures the Apify directory exists, as well as nested folders (for tests)
 */
export const ensureApifyDirectory = (file: string) => {
	const path = dirname(file);

	mkdirSync(path, { recursive: true });
};

export const TimestampFormatter = new Timestamp('YYYY-MM-DD [at] HH:mm:ss');

export const MultilineTimestampFormatter = new Timestamp(`YYYY-MM-DD[\n]HH:mm:ss`);

export const DateOnlyTimestampFormatter = new Timestamp('YYYY-MM-DD');

export const DurationFormatter = new SapphireDurationFormatter();

export const ShortDurationFormatter = new SapphireDurationFormatter({
	[TimeTypes.Day]: {
		DEFAULT: 'd',
	},
	[TimeTypes.Hour]: {
		DEFAULT: 'h',
	},
	[TimeTypes.Minute]: {
		DEFAULT: 'm',
	},
	[TimeTypes.Month]: {
		DEFAULT: 'M',
	},
	[TimeTypes.Second]: {
		DEFAULT: 's',
	},
	[TimeTypes.Week]: {
		DEFAULT: 'w',
	},
	[TimeTypes.Year]: {
		DEFAULT: 'y',
	},
});

/**
 * A "polyfill" for Object.groupBy
 */
export function objectGroupBy<K extends PropertyKey, T>(
	items: Iterable<T>,
	keySelector: (item: T, index: number) => K,
): Partial<Record<K, T[]>> {
	if ('groupBy' in Object) {
		return (Object.groupBy as typeof objectGroupBy)(items, keySelector);
	}

	const result: Partial<Record<K, T[]>> = {};

	let i = 0;

	for (const item of items) {
		const key = keySelector(item, i++);
		if (!result[key]) {
			result[key] = [];
		}

		result[key].push(item);
	}

	return result;
}
