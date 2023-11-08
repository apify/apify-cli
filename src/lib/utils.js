const {
    execSync,
    spawnSync,
} = require('child_process');
const fs = require('fs');
const https = require('https');
const path = require('path');

const {
    ACT_JOB_TERMINAL_STATUSES,
    ACTOR_ENV_VARS,
    LOCAL_ACTOR_ENV_VARS,
    ACTOR_NAME,
    APIFY_ENV_VARS,
    KEY_VALUE_STORE_KEYS,
    LOCAL_STORAGE_SUBDIRS,
    SOURCE_FILE_FORMATS,
} = require('@apify/consts');
const { ApifyClient } = require('apify-client');
const archiver = require('archiver-promise');
const escapeStringRegexp = require('escape-string-regexp');
const globby = require('globby');
const inquirer = require('inquirer');
const { getEncoding } = require('istextorbinary');
const loadJson = require('load-json-file');
const mime = require('mime');
const semver = require('semver');
const _ = require('underscore');
const writeJson = require('write-json-file');

const { promisify } = require('util');
const { finished } = require('stream');
const AdmZip = require('adm-zip');
const {
    GLOBAL_CONFIGS_FOLDER,
    AUTH_FILE_PATH,
    INPUT_FILE_REG_EXP,
    DEFAULT_LOCAL_STORAGE_DIR,
    LOCAL_CONFIG_PATH,
    DEPRECATED_LOCAL_CONFIG_NAME,
    ACTOR_SPECIFICATION_VERSION,
    APIFY_CLIENT_DEFAULT_HEADERS,
    SUPPORTED_NODEJS_VERSION,
    MINIMUM_SUPPORTED_PYTHON_VERSION,
    LANGUAGE,
    PROJECT_TYPES,
} = require('./consts');
const {
    ensureFolderExistsSync,
    rimrafPromised,
    deleteFile,
} = require('./files');
const {
    info,
} = require('./outputs');
const { ProjectAnalyzer } = require('./project_analyzer');

/**
 * @param {string} url
 * @returns {Promise<unknown>}
 */
const httpsGet = async (url) => {
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            // Handle redirects
            if (response.statusCode === 301 || response.statusCode === 302) {
                resolve(httpsGet(response.headers.location));
                // Destroy the response to close the HTTP connection, otherwise this hangs for a long time with Node 19+ (due to HTTP keep-alive).
                response.destroy();
            } else {
                resolve(response);
            }
        }).on('error', reject);
    });
};

// Properties from apify.json file that will me migrated to actor specs in .actor/actor.json
const MIGRATED_APIFY_JSON_PROPERTIES = ['name', 'version', 'buildTag'];

const getLocalStorageDir = () => {
    const envVar = APIFY_ENV_VARS.LOCAL_STORAGE_DIR;

    return process.env[envVar] || DEFAULT_LOCAL_STORAGE_DIR;
};
const getLocalKeyValueStorePath = (storeId) => {
    const envVar = ACTOR_ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID;
    const storeDir = storeId || process.env[envVar] || LOCAL_ACTOR_ENV_VARS[envVar];

    return path.join(getLocalStorageDir(), LOCAL_STORAGE_SUBDIRS.keyValueStores, storeDir);
};
const getLocalDatasetPath = (storeId) => {
    const envVar = ACTOR_ENV_VARS.DEFAULT_DATASET_ID;
    const storeDir = storeId || process.env[envVar] || LOCAL_ACTOR_ENV_VARS[envVar];

    return path.join(getLocalStorageDir(), LOCAL_STORAGE_SUBDIRS.datasets, storeDir);
};
const getLocalRequestQueuePath = (storeId) => {
    const envVar = ACTOR_ENV_VARS.DEFAULT_REQUEST_QUEUE_ID;
    const storeDir = storeId || process.env[envVar] || LOCAL_ACTOR_ENV_VARS[envVar];

    return path.join(getLocalStorageDir(), LOCAL_STORAGE_SUBDIRS.requestQueues, storeDir);
};

/**
 * Returns object from auth file or empty object.
 * @return {*}
 */
const getLocalUserInfo = () => {
    try {
        return loadJson.sync(AUTH_FILE_PATH) || {};
    } catch (e) {
        return {};
    }
};

/**
 * Gets instance of ApifyClient for user otherwise throws error
 * @return {Promise<boolean|*>}
 */
const getLoggedClientOrThrow = async () => {
    const loggedClient = await getLoggedClient();
    if (!loggedClient) {
        throw new Error('You are not logged in with your Apify account. Call "apify login" to fix that.');
    }
    return loggedClient;
};

/**
 * Returns options for ApifyClient
 * @param {String|null|undefined} token
 * @returns {Object}
 */
const getApifyClientOptions = (token, apiBaseUrl) => {
    if (!token && fs.existsSync(GLOBAL_CONFIGS_FOLDER) && fs.existsSync(AUTH_FILE_PATH)) {
        ({ token } = loadJson.sync(AUTH_FILE_PATH));
    }

    return {
        token,
        baseUrl: apiBaseUrl || process.env.APIFY_CLIENT_BASE_URL,
        requestInterceptors: [(config) => {
            config.headers = { ...APIFY_CLIENT_DEFAULT_HEADERS, ...config.headers };
            return config;
        }],
    };
};

/**
 * Gets instance of ApifyClient for token or for params from global auth file.
 * NOTE: It refreshes global auth file each run
 * @param [token]
 * @return {Promise<*>}
 */
const getLoggedClient = async (token, apiBaseUrl) => {
    if (!token && fs.existsSync(GLOBAL_CONFIGS_FOLDER) && fs.existsSync(AUTH_FILE_PATH)) {
        ({ token } = loadJson.sync(AUTH_FILE_PATH));
    }

    const apifyClient = new ApifyClient(getApifyClientOptions(token, apiBaseUrl));
    let userInfo;
    try {
        userInfo = await apifyClient.user('me').get();
    } catch (e) {
        return false;
    }

    // Always refresh Auth file
    if (!fs.existsSync(GLOBAL_CONFIGS_FOLDER)) fs.mkdirSync(GLOBAL_CONFIGS_FOLDER);
    writeJson.sync(AUTH_FILE_PATH, { token: apifyClient.token, ...userInfo });
    return apifyClient;
};

const getLocalConfigPath = () => path.join(process.cwd(), LOCAL_CONFIG_PATH);

/**
 * @deprecated Use getLocalConfigPath
 * @returns {string}
 */
const getDeprecatedLocalConfigPath = () => path.join(process.cwd(), DEPRECATED_LOCAL_CONFIG_NAME);

const getJsonFileContent = (filePath) => {
    if (!fs.existsSync(filePath)) {
        return;
    }
    return loadJson.sync(filePath);
};

const getLocalConfig = () => getJsonFileContent(getLocalConfigPath());

/**
 * @deprecated Use getLocalConfig
 * @returns {string}
 */
const getDeprecatedLocalConfig = () => getJsonFileContent(getDeprecatedLocalConfigPath());

const getLocalConfigOrThrow = async () => {
    let localConfig = getLocalConfig();
    let deprecatedLocalConfig = getDeprecatedLocalConfig();

    if (localConfig && deprecatedLocalConfig) {
        const answer = await inquirer.prompt([{
            name: 'isConfirm',
            type: 'confirm',

            message: `The new version of Apify CLI uses the "${LOCAL_CONFIG_PATH}" instead of the "apify.json" file. Since we have found both files in your actor directory, "apify.json" will be renamed to "apify.json.deprecated". Going forward, all commands will use "${LOCAL_CONFIG_PATH}". You can read about the differences between the old and the new config at https://github.com/apify/apify-cli/blob/master/MIGRATIONS.md. Do you want to continue?`,
        }]);
        if (!answer.isConfirm) {
            throw new Error('Command can not run with old "apify.json" file present in your actor directory., Please, either rename or remove it.');
        }
        try {
            fs.renameSync(getDeprecatedLocalConfigPath(), `${getDeprecatedLocalConfigPath()}.deprecated`);
            // eslint-disable-next-line max-len
            info(`The "apify.json" file has been renamed to "apify.json.deprecated". The deprecated file is no longer used by the CLI or Apify Console. If you do not need it for some specific purpose, it can be safely deleted.`);
        } catch (e) {
            throw new Error('Failed to rename deprecated "apify.json".');
        }
    }

    if (!localConfig && !deprecatedLocalConfig) {
        return {};
    }

    // If apify.json exists migrate it to .actor/actor.json
    if (!localConfig && deprecatedLocalConfig) {
        const answer = await inquirer.prompt([{
            name: 'isConfirm',
            type: 'confirm',
            // eslint-disable-next-line max-len
            message: `The new version of Apify CLI uses the "${LOCAL_CONFIG_PATH}" instead of the "apify.json" file. Your "apify.json" file will be automatically updated to the new format under "${LOCAL_CONFIG_PATH}". The original file will be renamed by adding the ".deprecated" suffix. Do you want to continue?`,
        }]);
        if (!answer.isConfirm) {
            throw new Error('Command can not run with old apify.json structure. Either let the CLI auto-update it or follow the guide on https://github.com/apify/apify-cli/blob/master/MIGRATIONS.md and update it manually.');
        }
        try {
            // Check if apify.json contains old deprecated structure. If so, updates it.
            if (_.isObject(deprecatedLocalConfig.version)) {
                deprecatedLocalConfig = updateLocalConfigStructure(deprecatedLocalConfig);
            }
            localConfig = {
                actorSpecification: ACTOR_SPECIFICATION_VERSION,
                environmentVariables: deprecatedLocalConfig.env || undefined,
                ..._.pick(deprecatedLocalConfig, MIGRATED_APIFY_JSON_PROPERTIES),
            };

            writeJson.sync(getLocalConfigPath(), localConfig);
            fs.renameSync(getDeprecatedLocalConfigPath(), `${getDeprecatedLocalConfigPath()}.deprecated`);
            // eslint-disable-next-line max-len
            info(`The "apify.json" file has been migrated to "${LOCAL_CONFIG_PATH}" and the original file renamed to "apify.json.deprecated". The deprecated file is no longer used by the CLI or Apify Console. If you do not need it for some specific purpose, it can be safely deleted. Do not forget to commit the new file to your Git repository.`);
        } catch (e) {
            throw new Error(`Can not update "${LOCAL_CONFIG_PATH}" structure. Follow guide on https://github.com/apify/apify-cli/blob/master/MIGRATIONS.md and update it manually.`);
        }
    }

    return localConfig;
};

const setLocalConfig = async (localConfig, actDir) => {
    actDir = actDir || process.cwd();
    writeJson.sync(path.join(actDir, LOCAL_CONFIG_PATH), localConfig);
};

const GITIGNORE_REQUIRED_CONTENTS = [getLocalStorageDir(), 'node_modules', '.venv'];

const setLocalEnv = async (actDir) => {
    // Create folders for emulation Apify stores
    const keyValueStorePath = getLocalKeyValueStorePath();
    ensureFolderExistsSync(actDir, getLocalDatasetPath());
    ensureFolderExistsSync(actDir, getLocalRequestQueuePath());
    ensureFolderExistsSync(actDir, keyValueStorePath);

    // Create or update gitignore
    const gitignorePath = path.join(actDir, '.gitignore');
    let gitignoreContents = '';
    if (fs.existsSync(gitignorePath)) {
        gitignoreContents = fs.readFileSync(gitignorePath, { encoding: 'utf-8' });
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
            fs.writeFileSync(gitignorePath, `\n${gitignoreAdditions.join('\n')}\n`, { flag: 'a' });
        } else {
            fs.writeFileSync(gitignorePath, `${gitignoreAdditions.join('\n')}\n`, { flag: 'w' });
        }
    }
};

/**
 * Convert Object with kebab-case keys to camelCased keys
 *
 * @param object
 * @return {{}}
 */
const argsToCamelCase = (object) => {
    const camelCasedObject = {};
    Object.keys(object).forEach((arg) => {
        const camelCasedArg = arg.replace(/-(.)/g, ($1) => $1.toUpperCase()).replace(/-/g, '');
        camelCasedObject[camelCasedArg] = object[arg];
    });
    return camelCasedObject;
};

// Detect whether file is binary from its MIME type, or if not available, contents
const getSourceFileFormat = (filePath, fileContent) => {
    // Try to detect the MIME type from the file path
    // .tgz files don't have a MIME type defined, this fixes it
    mime.define({ 'application/gzip': ['tgz'] }, true);
    // Default mime-type for .ts(x) files is video/mp2t. But in our usecases they're almost always TypeScript, which we want to treat as text
    mime.define({ 'text/typescript': ['ts', 'tsx', 'mts'] }, true);

    const contentType = mime.getType(filePath);
    if (contentType) {
        const format = (
            contentType.startsWith('text/')
            || contentType.includes('javascript')
            || contentType.includes('json')
            || contentType.includes('xml')
            || contentType.includes('application/node') // .cjs files
            || contentType.includes('application/toml') // for example pyproject.toml files
            || contentType.includes('application/x-httpd-php') // .php files
        )
            ? SOURCE_FILE_FORMATS.TEXT
            : SOURCE_FILE_FORMATS.BASE64;
        return format;
    }

    // If the MIME type detection failed, try to detect the file encoding from the file content
    const encoding = getEncoding(fileContent);
    return encoding === 'binary' ? SOURCE_FILE_FORMATS.BASE64 : SOURCE_FILE_FORMATS.TEXT;
};

const createSourceFiles = async (paths) => {
    return paths.map((filePath) => {
        const file = fs.readFileSync(filePath);
        const format = getSourceFileFormat(filePath, file);
        return {
            name: filePath,
            format,
            content: format === SOURCE_FILE_FORMATS.TEXT
                ? file.toString('utf8')
                : file.toString('base64'),
        };
    });
};

/**
 * Get actor local files, omit files defined in .gitignore and .git folder
 * All dot files(.file) and folders(.folder/) are included.
 */
const getActorLocalFilePaths = () => globby(['*', '**/**'], {
    ignore: ['.git/**', 'apify_storage', 'node_modules', 'storage', 'crawlee_storage'],
    gitignore: true,
    dot: true,
});

/**
 * Create zip file with all actor files specified with pathsToZip
 * @param zipName
 * @param pathsToZip
 * @return {Promise<void>}
 */
const createActZip = async (zipName, pathsToZip) => {
    // NOTE: There can be a zip from a previous unfinished operation.
    if (fs.existsSync(zipName)) await deleteFile(zipName);

    const archive = archiver(zipName);

    const archiveFilesPromises = [];
    pathsToZip.forEach((globPath) => archiveFilesPromises.push(archive.glob(globPath)));
    await Promise.all(archiveFilesPromises);

    await archive.finalize();
};

/**
 * Get actor input from local store
 * @return {{body: *, contentType: string}}
 */
const getLocalInput = () => {
    const defaultLocalStorePath = getLocalKeyValueStorePath();
    const files = fs.readdirSync(defaultLocalStorePath);
    const inputName = files.find((file) => !!file.match(INPUT_FILE_REG_EXP));

    // No input file
    if (!inputName) return;

    const input = fs.readFileSync(path.join(defaultLocalStorePath, inputName));
    const contentType = mime.getType(inputName);
    return { body: input, contentType };
};

const purgeDefaultQueue = async () => {
    const defaultQueuesPath = getLocalRequestQueuePath();
    if (fs.existsSync(getLocalStorageDir()) && fs.existsSync(defaultQueuesPath)) {
        await rimrafPromised(defaultQueuesPath);
    }
};

const purgeDefaultDataset = async () => {
    const defaultDatasetPath = getLocalDatasetPath();
    if (fs.existsSync(getLocalStorageDir()) && fs.existsSync(defaultDatasetPath)) {
        await rimrafPromised(defaultDatasetPath);
    }
};

const purgeDefaultKeyValueStore = async () => {
    const defaultKeyValueStorePath = getLocalKeyValueStorePath();
    if (!fs.existsSync(getLocalStorageDir()) || !fs.existsSync(defaultKeyValueStorePath)) {
        return;
    }
    const filesToDelete = fs.readdirSync(defaultKeyValueStorePath);

    const deletePromises = [];
    filesToDelete.forEach((file) => {
        if (!file.match(INPUT_FILE_REG_EXP)) deletePromises.push(deleteFile(path.join(defaultKeyValueStorePath, file)));
    });

    await Promise.all(deletePromises);
};

const outputJobLog = async (job, timeout) => {
    const { id: logId, status } = job;
    // In case job was already done just output log
    if (ACT_JOB_TERMINAL_STATUSES.includes(status)) {
        const apifyClient = new ApifyClient({ baseUrl: process.env.APIFY_CLIENT_BASE_URL });
        const log = await apifyClient.log(logId).get();
        process.stdout.write(log);
    }

    // In other case stream it to stdout
    // TODO: Use apifyClient.log(logId).stream() instead of http request stream.
    return new Promise((resolve, reject) => {
        const req = https.get(`https://api.apify.com/v2/logs/${logId}?stream=1`);
        let res;

        req.on('response', (response) => {
            res = response;
            response.on('data', (chunk) => process.stdout.write(chunk.toString()));
            response.on('error', (err) => {
                reject(err);
            });
        });
        req.on('error', (err) => {
            reject(err);
        });
        req.on('close', () => {
            resolve('finished');
        });

        if (timeout) {
            setTimeout(() => {
                if (res) res.removeAllListeners();
                if (req) {
                    req.removeAllListeners();
                    req.abort();
                }
                resolve('timeouts');
            }, timeout);
        }
    });
};

/**
 * Returns npm command for current os
 * NOTE: For window we have to returns npm.cmd instead of npm, otherwise it doesn't work
 * @return {string}
 */
const getNpmCmd = () => {
    return /^win/.test(process.platform) ? 'npm.cmd' : 'npm';
};

/**
 * Returns true if apify storage is empty (expect INPUT.*)
 * @return {Promise<boolean>}
 */
const checkIfStorageIsEmpty = async () => {
    const filesWithoutInput = await globby([
        `${getLocalStorageDir()}/**`,
        // Omit INPUT.* file
        `!${getLocalKeyValueStorePath()}/${KEY_VALUE_STORE_KEYS.INPUT}.*`,
    ]);
    return filesWithoutInput.length === 0;
};

/**
 * Show help for command
 * NOTE: This is not nice, but I can not find other way..
 * @param command
 */
const showHelpForCommand = (command) => {
    execSync(`apify ${command} --help`, { stdio: [0, 1, 2] });
};

/**
 * Migration for deprecated structure of apify.json to latest.
 * @param localConfig
 */
const updateLocalConfigStructure = (localConfig) => {
    const updatedLocalConfig = {
        name: localConfig.name,
        template: localConfig.template,
        version: localConfig.version.versionNumber,
        buildTag: localConfig.version.buildTag,
        env: null,
    };
    if (localConfig.version.envVars && localConfig.version.envVars.length) {
        const env = {};
        localConfig.version.envVars.forEach((envVar) => {
            if (envVar.name && envVar.value) env[envVar.name] = envVar.value;
        });
        updatedLocalConfig.env = env;
    }
    return updatedLocalConfig;
};

/**
 * Validates actor name, if finds issue throws error.
 * @param actorName
 */
const validateActorName = (actorName) => {
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

const getPythonCommand = (directory) => {
    const pythonVenvPath = /^win/.test(process.platform)
        ? 'Scripts/python.exe'
        : 'bin/python3';

    let fullPythonVenvPath;
    if (process.env.VIRTUAL_ENV) {
        fullPythonVenvPath = path.join(process.env.VIRTUAL_ENV, pythonVenvPath);
    } else {
        fullPythonVenvPath = path.join(directory, '.venv', pythonVenvPath);
    }

    if (fs.existsSync(fullPythonVenvPath)) {
        return fullPythonVenvPath;
    }

    return /^win/.test(process.platform)
        ? 'python'
        : 'python3';
};

const detectPythonVersion = (directory) => {
    const pythonCommand = getPythonCommand(directory);
    try {
        const spawnResult = spawnSync(pythonCommand, ['-c', 'import platform; print(platform.python_version())'], { encoding: 'utf-8' });
        if (!spawnResult.error && spawnResult.stdout) {
            return spawnResult.stdout.trim();
        }
    } catch {
        return undefined;
    }
};

const isPythonVersionSupported = (installedPythonVersion) => {
    return semver.satisfies(installedPythonVersion, `^${MINIMUM_SUPPORTED_PYTHON_VERSION}`);
};

const detectNodeVersion = () => {
    try {
        const spawnResult = spawnSync('node', ['--version'], { encoding: 'utf-8' });
        if (!spawnResult.error && spawnResult.stdout) {
            return spawnResult.stdout.trim().replace(/^v/, '');
        }
    } catch {
        return undefined;
    }
};

const isNodeVersionSupported = (installedNodeVersion) => {
    // SUPPORTED_NODEJS_VERSION can be a version range,
    // we need to get the minimum supported version from that range to be able to compare them
    const minimumSupportedNodeVersion = semver.minVersion(SUPPORTED_NODEJS_VERSION);
    return semver.gte(installedNodeVersion, minimumSupportedNodeVersion);
};

const detectNpmVersion = () => {
    const npmCommand = getNpmCmd();
    try {
        const spawnResult = spawnSync(npmCommand, ['--version'], { encoding: 'utf-8' });
        if (!spawnResult.error && spawnResult.stdout) {
            return spawnResult.stdout.trim().replace(/^v/, '');
        }
    } catch {
        return undefined;
    }
};

const detectLocalActorLanguage = () => {
    const cwd = process.cwd();
    const isActorInNode = fs.existsSync(path.join(cwd, 'package.json'));
    const isActorInPython = fs.existsSync(path.join(cwd, 'src/__main__.py')) || ProjectAnalyzer.getProjectType(cwd) === PROJECT_TYPES.SCRAPY;
    const result = {};
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

const downloadAndUnzip = async ({ url, pathTo }) => {
    const zipStream = await httpsGet(url);
    const chunks = [];
    zipStream.on('data', (chunk) => chunks.push(chunk));
    await promisify(finished)(zipStream);
    const zip = new AdmZip(Buffer.concat(chunks));
    zip.extractAllTo(pathTo, true);
};

module.exports = {
    httpsGet,
    getLoggedClientOrThrow,
    getLocalConfig,
    setLocalConfig,
    setLocalEnv,
    argsToCamelCase,
    getLoggedClient,
    createActZip,
    getLocalUserInfo,
    getLocalConfigOrThrow,
    getLocalInput,
    purgeDefaultQueue,
    purgeDefaultDataset,
    purgeDefaultKeyValueStore,
    outputJobLog,
    getLocalKeyValueStorePath,
    getLocalDatasetPath,
    getLocalRequestQueuePath,
    getNpmCmd,
    checkIfStorageIsEmpty,
    getLocalStorageDir,
    showHelpForCommand,
    getActorLocalFilePaths,
    createSourceFiles,
    validateActorName,
    getJsonFileContent,
    getApifyClientOptions,
    detectPythonVersion,
    isPythonVersionSupported,
    getPythonCommand,
    detectNodeVersion,
    isNodeVersionSupported,
    detectNpmVersion,
    detectLocalActorLanguage,
    downloadAndUnzip,
};
