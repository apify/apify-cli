import { execSync } from 'node:child_process';
import { createWriteStream, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';

import { DurationFormatter as SapphireDurationFormatter, TimeTypes } from '@sapphire/duration';
import { Timestamp } from '@sapphire/timestamp';
import AdmZip from 'adm-zip';
import _Ajv2019 from 'ajv/dist/2019.js';
import { type ActorRun, ApifyClient, type Build } from 'apify-client';
import { ZipArchive } from 'archiver';
import axios from 'axios';
import escapeStringRegexp from 'escape-string-regexp';
import ignoreModule, { type Ignore } from 'ignore';
import { getEncoding } from 'istextorbinary';
import { Mime } from 'mime';
import otherMimes from 'mime/types/other.js';
import standardMimes from 'mime/types/standard.js';
import { gte, minVersion, satisfies } from 'semver';
import { glob } from 'tinyglobby';

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

import { ensureAuthFileCurrent, lookUpActiveProfile } from './auth-file.js';
import { describeAuthFailure, getApifyClientOptions, resolveAuth } from './auth.js';
import {
	AUTH_FILE_PATH,
	CommandExitCodes,
	DEFAULT_LOCAL_STORAGE_DIR,
	LOCAL_CONFIG_PATH,
	MINIMUM_SUPPORTED_PYTHON_VERSION,
	SUPPORTED_NODEJS_VERSION,
} from './consts.js';
import { ensureMigrated, getProxyPassword, getToken } from './credentials.js';
import { deleteFile, ensureFolderExistsSync, rimrafPromised } from './files.js';
import { useCLIMetadata } from './hooks/useCLIMetadata.js';
import { inputFileRegExp, TEMP_INPUT_KEY_PREFIX } from './input-key.js';
import type { AuthJSON } from './types.js';
import { cliDebugPrint } from './utils/cliDebugPrint.js';

// `ignore` is a CJS package; TypeScript sees its default import as the module
// object rather than the callable factory, so we cast through unknown.
const makeIg = ignoreModule as unknown as () => Ignore;

// Export AJV properly: https://github.com/ajv-validator/ajv/issues/2132
// Welcome to the state of JavaScript/TypeScript and CJS/ESM interop.
export const Ajv2019 = _Ajv2019 as unknown as typeof import('ajv/dist/2019.js').default;

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
 * The active profile in the flat shape the CLI consumes, or an empty object when nothing is
 * stored. Secrets come from whichever backend holds them; the metadata comes from auth.json.
 */
export const getLocalUserInfo = async (): Promise<AuthJSON> => {
	await ensureMigrated();
	await ensureAuthFileCurrent();

	const { profile, missingProfile } = lookUpActiveProfile();

	const result: AuthJSON = {};
	if (profile) {
		result.id = profile.id;
		if (profile.username) result.username = profile.username;
		if (profile.organizationOwnerUserId) result.organizationOwnerUserId = profile.organizationOwnerUserId;
	}

	const token = await getToken();
	if (token) result.token = token;

	const proxyPassword = await getProxyPassword();
	if (proxyPassword) result.proxy = { password: proxyPassword };

	// A token with no profile behind it is reported rather than swallowed: the commands that build
	// `<username>/<name>` lookups would otherwise fail with a misleading "not found".
	if (!profile) {
		if (!result.token) return {};

		throw new Error(
			missingProfile
				? `Your active profile "${missingProfile}" is missing from ${AUTH_FILE_PATH()}. Run "apify login" to log in again.`
				: 'Stale credentials found without user metadata. Run "apify login" again.',
		);
	}

	return result;
};

/**
 * Gets instance of ApifyClient for user otherwise throws error
 */
export async function getLoggedClientOrThrow() {
	const { client, error } = await getLoggedClient();

	if (!client) {
		process.exitCode = CommandExitCodes.MissingAuth;
		throw new Error(await describeAuthFailure(error));
	}
	return client;
}

let cachedUserInfo: { token: string; userInfo: AuthJSON } | undefined;

/** Test-only: drop the in-memory account metadata so each test starts fresh. */
export function __resetUserInfoCacheForTests() {
	cachedUserInfo = undefined;
}

/**
 * `client` is `null` when no token is available or the lookup failed; `error` carries that
 * failure, so the caller can tell a rejected token from an API it could not reach.
 *
 * Read-only: the resolved token is never persisted.
 */
async function getLoggedClient(): Promise<{ client: ApifyClient | null; error?: unknown }> {
	const auth = await resolveAuth();
	if (!auth) return { client: null };

	const apifyClient = new ApifyClient(await getApifyClientOptions(auth.token));

	try {
		const userInfo = (await apifyClient.user('me').get()) as AuthJSON;
		cachedUserInfo = { token: auth.token, userInfo };
	} catch (err) {
		cliDebugPrint('[getLoggedClient] error getting user info', { error: err });
		return { client: null, error: err };
	}

	return { client: apifyClient };
}

/**
 * Account metadata for the token the current command resolved. An env token has no entry in
 * auth.json, so the account is read from the API, normally off the cache {@link getLoggedClient}
 * already filled.
 */
export async function getCurrentUserInfo(): Promise<AuthJSON> {
	const auth = await resolveAuth();
	if (!auth || auth.source === 'stored') return getLocalUserInfo();

	if (cachedUserInfo?.token === auth.token) return cachedUserInfo.userInfo;

	const apifyClient = new ApifyClient(await getApifyClientOptions(auth.token));
	const userInfo = (await apifyClient.user('me').get()) as AuthJSON;
	cachedUserInfo = { token: auth.token, userInfo };

	return userInfo;
}

export const getLocalConfigPath = (cwd: string) => join(cwd, LOCAL_CONFIG_PATH);

export const getJsonFileContent = <T = Record<string, unknown>>(filePath: string) => {
	if (!existsSync(filePath)) {
		return;
	}

	return JSON.parse(readFileSync(filePath, { encoding: 'utf-8' })) as T;
};

export const getLocalConfig = (cwd: string) => getJsonFileContent(getLocalConfigPath(cwd));

export const setLocalConfig = async (localConfig: Record<string, unknown>, actDir?: string) => {
	const fullPath = join(actDir || process.cwd(), LOCAL_CONFIG_PATH);

	await mkdir(dirname(fullPath), { recursive: true });

	writeFileSync(fullPath, JSON.stringify(localConfig, null, '\t'));
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
			writeFileSync(gitignorePath, `\n${gitignoreAdditions.join('\n')}\n`, {
				flag: 'a',
			});
		} else {
			writeFileSync(gitignorePath, `${gitignoreAdditions.join('\n')}\n`, {
				flag: 'w',
			});
		}
	}
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
			contentType.includes('application/x-sh') || // .sh files
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
 * Fallback for when git is unavailable: find all .gitignore files and build a filter
 * using the `ignore` package, scoped to each file's directory.
 * Also walks ancestor directories to pick up parent .gitignore files (e.g. monorepo root),
 * stopping at the first .git boundary found.
 */
const getGitignoreFallbackFilter = async (cwd: string): Promise<(paths: string[]) => string[]> => {
	const gitignoreFiles = await glob('**/.gitignore', {
		dot: true,
		cwd,
		ignore: ['.git/**'],
		expandDirectories: false,
	});

	const filters: { dir: string; ig: Ignore; ancestorPrefix?: string }[] = [];

	for (const gitignoreFile of gitignoreFiles) {
		const gitignoreDir = dirname(gitignoreFile); // e.g. 'src' or '.'
		const content = await readFile(join(cwd, gitignoreFile), 'utf-8');
		filters.push({ dir: gitignoreDir === '.' ? '' : gitignoreDir, ig: makeIg().add(content) });
	}

	// Walk ancestor directories to pick up parent .gitignore files (e.g. monorepo root).
	// Check for a .git boundary FIRST so we stop before processing the git root's own
	// .gitignore — that file is handled by `git ls-files` when git is available, and
	// avoids accidentally applying rules from an unrelated outer repository.
	let parentDir = dirname(cwd);
	while (parentDir !== dirname(parentDir)) {
		if (existsSync(join(parentDir, '.git'))) {
			break;
		}

		const parentGitignorePath = join(parentDir, '.gitignore');
		if (existsSync(parentGitignorePath)) {
			try {
				const content = await readFile(parentGitignorePath, 'utf-8');
				// Paths passed to this filter are relative to cwd. To test them against
				// a .gitignore that lives above cwd we need to prepend the relative path
				// from the ancestor dir to cwd so the ignore patterns see the right scope.
				const ancestorPrefix = relative(parentDir, cwd);
				filters.push({ dir: '', ig: makeIg().add(content), ancestorPrefix });
			} catch {
				// Ignore read errors
			}
		}

		parentDir = dirname(parentDir);
	}

	if (filters.length === 0) {
		return (paths) => paths;
	}

	return (paths) =>
		paths.filter((filePath) => {
			for (const { dir, ig, ancestorPrefix } of filters) {
				let relativePath: string | null;
				if (!dir) {
					relativePath = ancestorPrefix ? `${ancestorPrefix}/${filePath}` : filePath;
				} else if (filePath.startsWith(`${dir}/`)) {
					relativePath = filePath.slice(dir.length + 1);
				} else {
					relativePath = null;
				}
				if (relativePath !== null && ig.ignores(relativePath)) {
					return false;
				}
			}
			return true;
		});
};

interface ActorIgnoreResult {
	/** Filter that removes paths matching non-negated .actorignore patterns */
	excludeFilter: ((paths: string[]) => string[]) | null;
	/** Patterns from negation lines (with `!` stripped) — files matching these should be force-included even if git-ignored */
	forceIncludePatterns: string[];
}

const parseActorIgnore = async (cwd: string): Promise<ActorIgnoreResult> => {
	const actorignorePath = join(cwd, '.actorignore');
	if (!existsSync(actorignorePath)) {
		return { excludeFilter: null, forceIncludePatterns: [] };
	}

	const content = await readFile(actorignorePath, 'utf-8');
	const lines = content.split('\n');

	const excludeLines: string[] = [];
	const forceIncludePatterns: string[] = [];

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		if (trimmed.startsWith('!')) {
			forceIncludePatterns.push(trimmed.slice(1));
		} else {
			excludeLines.push(trimmed);
		}
	}

	const excludeFilter =
		excludeLines.length > 0
			? (paths: string[]) => {
					const ig = makeIg().add(excludeLines);
					return paths.filter((filePath) => !ig.ignores(filePath));
				}
			: null;

	return { excludeFilter, forceIncludePatterns };
};

/**
 * Get Actor local files, omit files defined in .gitignore, .actorignore and .git folder
 * All dot files(.file) and folders(.folder/) are included.
 */
export const getActorLocalFilePaths = async (cwd?: string) => {
	const resolvedCwd = cwd ?? process.cwd();

	const hardcodedIgnore = ['.git/**', 'apify_storage', 'node_modules', 'storage', 'crawlee_storage'];

	// Parse .actorignore early to get both exclude filter and force-include patterns
	const { excludeFilter: actorignoreFilter, forceIncludePatterns } = await parseActorIgnore(resolvedCwd);

	let gitIgnoreFilter: ((paths: string[]) => string[]) | null = null;

	// Use git ls-files to get gitignored paths — this correctly handles ancestor .gitignore files,
	// nested .gitignore files, .git/info/exclude, and global gitignore config
	try {
		const gitIgnored = execSync('git ls-files --others --ignored --exclude-standard --directory', {
			cwd: resolvedCwd,
			encoding: 'utf-8',
			stdio: ['ignore', 'pipe', 'ignore'],
		})
			.split('\n')
			.filter(Boolean);

		if (gitIgnored.length > 0) {
			const ig = makeIg().add(gitIgnored);
			gitIgnoreFilter = (paths) => paths.filter((p) => !ig.ignores(p));
		}
	} catch {
		// git is unavailable or directory is not a git repo — fall back to parsing .gitignore files
		gitIgnoreFilter = await getGitignoreFallbackFilter(resolvedCwd);
	}

	const allFiles = await glob(['*', '**/**'], {
		ignore: hardcodedIgnore,
		dot: true,
		expandDirectories: false,
		cwd: resolvedCwd,
	});

	let paths = gitIgnoreFilter ? gitIgnoreFilter(allFiles) : allFiles;

	if (actorignoreFilter) {
		paths = actorignoreFilter(paths);
	}

	// Force-include: negation patterns in .actorignore (e.g. !dist/) override gitignore,
	// allowing git-ignored files to be included in the push
	if (forceIncludePatterns.length > 0) {
		const forceIncludeIg = makeIg().add(forceIncludePatterns);
		const forceIncluded = allFiles.filter((filePath) => forceIncludeIg.ignores(filePath));
		const pathSet = new Set(paths);
		for (const file of forceIncluded) {
			pathSet.add(file);
		}
		paths = [...pathSet];
	}

	// .actor/ is the Actor specification folder — always include it regardless of gitignore/actorignore
	const actorSpecFiles = allFiles.filter((p) => p === '.actor' || p.startsWith('.actor/'));
	if (actorSpecFiles.length > 0) {
		const pathSet = new Set(paths);
		for (const file of actorSpecFiles) {
			pathSet.add(file);
		}
		paths = [...pathSet];
	}

	return paths;
};

/**
 * Create zip file with all Actor files specified with pathsToZip
 */
export const createActZip = async (zipName: string, pathsToZip: string[], cwd: string) => {
	// NOTE: There can be a zip from a previous unfinished operation.
	if (existsSync(zipName)) {
		await deleteFile(zipName);
	}

	const writeStream = createWriteStream(zipName);
	// Use compression level 6 for better balance between speed and compression ratio (default is 9)
	const archive = new ZipArchive({
		zlib: { level: 6 },
	});
	archive.pipe(writeStream);

	pathsToZip.forEach((filePath) => archive.file(join(cwd, filePath), { name: filePath }));

	await archive.finalize();
};

/**
 * Get Actor input from local store
 */
export const getLocalInput = (cwd: string, inputKey?: string) => {
	const defaultLocalStorePath = getLocalKeyValueStorePath();

	const storePath = resolve(cwd, defaultLocalStorePath);

	if (!existsSync(storePath)) return;

	const files = readdirSync(storePath);
	const inputName = files.find((file) => !!file.match(inputFileRegExp(inputKey ?? 'INPUT')));

	// No input file
	if (!inputName) return;

	const input = readFileSync(join(storePath, inputName));
	const contentType = mime.getType(inputName);
	return { body: input, contentType, fileName: inputName };
};

export const purgeDefaultQueue = async () => {
	await rimrafPromised(resolve(process.cwd(), getLocalRequestQueuePath()));
};

export const purgeDefaultDataset = async () => {
	await rimrafPromised(resolve(process.cwd(), getLocalDatasetPath()));
};

/**
 * Deletes every record from the default key-value store, except the files
 * matching the given input keys. Defaults to preserving `INPUT.*`.
 */
export const purgeDefaultKeyValueStore = async (...inputKeys: string[]) => {
	const defaultKeyValueStorePath = resolve(process.cwd(), getLocalKeyValueStorePath());
	if (!existsSync(defaultKeyValueStorePath)) {
		return;
	}
	const filesToDelete = readdirSync(defaultKeyValueStorePath);
	const preserveRegExps = (inputKeys.length > 0 ? inputKeys : ['INPUT']).map(inputFileRegExp);

	const deletePromises: Promise<void>[] = [];
	filesToDelete.forEach((file) => {
		if (!preserveRegExps.some((re) => re.test(file))) {
			deletePromises.push(deleteFile(join(defaultKeyValueStorePath, file)));
		}
	});

	await Promise.all(deletePromises);
};

export const outputJobLog = async ({
	job,
	timeoutMillis,
	apifyClient,
}: {
	job: ActorRun | Build;
	timeoutMillis?: number;
	apifyClient?: ApifyClient;
}) => {
	const { id: logId, status } = job;
	const client = apifyClient || new ApifyClient({ baseUrl: process.env.APIFY_CLIENT_BASE_URL });

	// In case job was already done just output log
	if (ACTOR_JOB_TERMINAL_STATUSES.includes(status as never)) {
		if (process.env.APIFY_NO_LOGS_IN_TESTS) {
			return;
		}

		const log = await client.log(logId).get();
		process.stderr.write(log!);
		return;
	}

	// In other case stream it to stderr
	// eslint-disable-next-line no-async-promise-executor
	return new Promise<'no-logs' | 'finished' | 'timeouts'>(async (resolve) => {
		const stream = await client.log(logId).stream();

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

		if (timeoutMillis !== undefined) {
			nodeTimeout = setTimeout(() => {
				stream.destroy();
				resolve('timeouts');
			}, timeoutMillis);
		}
	});
};

/**
 * Returns npm command for current os
 * NOTE: For window we have to returns npm.cmd instead of npm, otherwise it doesn't work
 */
export const getNpmCmd = (): string => {
	return process.platform.startsWith('win') ? 'npm.cmd' : 'npm';
};

/**
 * Returns true if the local storage holds nothing but the input file, either
 * the user's own `<inputKey>.*` or the temporary copy the CLI writes next to it.
 */
export const checkIfStorageIsEmpty = async (inputKey?: string) => {
	const key = inputKey || KEY_VALUE_STORE_KEYS.INPUT;
	// Storage paths use backslashes on Windows, which glob reads as escape characters.
	const storageDir = getLocalStorageDir().replaceAll('\\', '/');
	const keyValueStoreDir = getLocalKeyValueStorePath().replaceAll('\\', '/');

	const filesWithoutInput = await glob(
		[`${storageDir}/**`, `!${keyValueStoreDir}/${key}.*`, `!${keyValueStoreDir}/${TEMP_INPUT_KEY_PREFIX}${key}.*`],
		{ cwd: process.cwd() },
	);

	return filesWithoutInput.length === 0;
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

export const isPythonVersionSupported = (installedPythonVersion: string) => {
	return satisfies(installedPythonVersion, `^${MINIMUM_SUPPORTED_PYTHON_VERSION}`);
};

export const isNodeVersionSupported = (installedNodeVersion: string) => {
	// SUPPORTED_NODEJS_VERSION can be a version range,
	// we need to get the minimum supported version from that range to be able to compare them
	const minimumSupportedNodeVersion = minVersion(SUPPORTED_NODEJS_VERSION)!;
	return gte(installedNodeVersion, minimumSupportedNodeVersion);
};

export const downloadZip = async (url: string) => {
	const response = await axios.get(url, {
		responseType: 'arraybuffer',
		validateStatus: () => true,
		headers: { 'User-Agent': `Apify CLI/${useCLIMetadata().version} (https://github.com/apify/apify-cli)` },
	});

	if (response.status < 200 || response.status >= 300) {
		const body = Buffer.from(response.data).toString('utf8').trim().slice(0, 500);
		throw new Error(
			`Failed to download the archive from ${url} (HTTP ${response.status}).${body ? `\nServer response: ${body}` : ''}`,
		);
	}

	const data = Buffer.from(response.data);

	// Zip magic bytes - anything else is a block page or error body served instead of the archive
	if (data.subarray(0, 2).toString() !== 'PK') {
		throw new Error(
			`The file downloaded from ${url} is not a valid zip archive - ` +
				`a proxy or firewall likely intercepted the download. Check your network or try a different one.`,
		);
	}

	return new AdmZip(data);
};

export const downloadAndUnzip = async ({ url, pathTo }: { url: string; pathTo: string }) => {
	const zip = await downloadZip(url);
	zip.extractAllTo(pathTo, true);
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

/**
 * A "polyfill" for Map.groupBy
 */
export function mapGroupBy<K, T>(items: Iterable<T>, keySelector: (item: T, index: number) => K): Map<K, T[]> {
	const map = new Map<K, T[]>();
	let index = 0;

	for (const value of items) {
		const key = keySelector(value, index++);
		const list = map.get(key);

		if (list) {
			list.push(value);
		} else {
			map.set(key, [value]);
		}
	}

	return map;
}

export function printJsonToStdout(object: unknown) {
	console.log(JSON.stringify(object, null, 2));
}

/** Like `os.homedir()` but honors an explicit `$HOME` override on Windows (where `homedir()` reads `USERPROFILE` instead). */
export const userHomeDir = () => process.env.HOME ?? homedir();

export const tildify = (path: string) => {
	const home = userHomeDir();
	if (home && path.startsWith(home)) {
		return path.replace(home, '~');
	}

	return path;
};

export function detectShell() {
	const shell = process.env.SHELL ?? '';

	if (shell.includes('zsh')) {
		return 'zsh';
	}

	if (shell.includes('bash')) {
		return 'bash';
	}

	if (shell.includes('fish')) {
		return 'fish';
	}

	return 'unknown';
}

export function shellConfigFile(userHomeDirectory: string, shell: ReturnType<typeof detectShell>): string | null {
	// eslint-disable-next-line default-case -- We do not want to add a shell and it fall through to default case
	switch (shell) {
		case 'bash': {
			const configFiles = [join(userHomeDirectory, '.bashrc'), join(userHomeDirectory, '.bash_profile')];

			if (process.env.XDG_CONFIG_HOME) {
				configFiles.push(
					join(process.env.XDG_CONFIG_HOME, '.bashrc'),
					join(process.env.XDG_CONFIG_HOME, '.bash_profile'),
					join(process.env.XDG_CONFIG_HOME, 'bashrc'),
					join(process.env.XDG_CONFIG_HOME, 'bash_profile'),
				);
			}

			for (const maybeConfigFile of configFiles) {
				if (existsSync(maybeConfigFile)) {
					return maybeConfigFile;
				}
			}

			return null;
		}
		case 'zsh': {
			// Honor explicit $HOME (via userHomeDir) for ~ consistency with other shells and MCP paths.
			const zshBaseDir = process.env.ZDOTDIR || userHomeDirectory || userHomeDir();
			return join(zshBaseDir, '.zshrc');
		}
		case 'fish': {
			return join(userHomeDirectory, '.config', 'fish', 'config.fish');
		}
		case 'unknown': {
			return null;
		}
	}
}

export function parseWaitForFinishMillis(flag: string | undefined): number | undefined {
	if (flag === undefined) return undefined;
	const parsed = Number.parseInt(flag, 10);
	if (!Number.isFinite(parsed) || parsed < 0) return undefined;
	return parsed * 1000;
}
