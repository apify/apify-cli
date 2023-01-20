const path = require('path');
const fs = require('fs');
const mime = require('mime');
const { getEncoding } = require('istextorbinary');
const _ = require('underscore');
const globby = require('globby');
const archiver = require('archiver-promise');
const loadJson = require('load-json-file');
const writeJson = require('write-json-file');
const inquirer = require('inquirer');
const { LOCAL_STORAGE_SUBDIRS,
    ENV_VARS,
    LOCAL_ENV_VARS,
    KEY_VALUE_STORE_KEYS,
    ACT_JOB_TERMINAL_STATUSES,
    SOURCE_FILE_FORMATS,
    ACTOR_NAME,
} = require('@apify/consts');
const https = require('https');
const { ApifyClient } = require('apify-client');
const {
    execSync,
} = require('child_process');
const semver = require('semver');
const {
    GLOBAL_CONFIGS_FOLDER,
    AUTH_FILE_PATH,
    INPUT_FILE_REG_EXP,
    DEFAULT_LOCAL_STORAGE_DIR,
    LOCAL_CONFIG_PATH,
    DEPRECATED_LOCAL_CONFIG_NAME,
    ACTOR_SPECIFICATION_VERSION,
    APIFY_CLIENT_DEFAULT_HEADERS,
    MINIMUM_SUPPORTED_PYTHON_VERSION,
} = require('./consts');
const {
    ensureFolderExistsSync,
    rimrafPromised,
    deleteFile,
} = require('./files');
const {
    info,
} = require('./outputs');

// Properties from apify.json file that will me migrated to actor specs in .actor/actor.json
const MIGRATED_APIFY_JSON_PROPERTIES = ['name', 'version', 'buildTag'];

const getLocalStorageDir = () => {
    const envVar = ENV_VARS.LOCAL_STORAGE_DIR;

    return process.env[envVar] || DEFAULT_LOCAL_STORAGE_DIR;
};
const getLocalKeyValueStorePath = (storeId) => {
    const envVar = ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID;
    const storeDir = storeId || process.env[envVar] || LOCAL_ENV_VARS[envVar];

    return path.join(getLocalStorageDir(), LOCAL_STORAGE_SUBDIRS.keyValueStores, storeDir);
};
const getLocalDatasetPath = (storeId) => {
    const envVar = ENV_VARS.DEFAULT_DATASET_ID;
    const storeDir = storeId || process.env[envVar] || LOCAL_ENV_VARS[envVar];

    return path.join(getLocalStorageDir(), LOCAL_STORAGE_SUBDIRS.datasets, storeDir);
};
const getLocalRequestQueuePath = (storeId) => {
    const envVar = ENV_VARS.DEFAULT_REQUEST_QUEUE_ID;
    const storeDir = storeId || process.env[envVar] || LOCAL_ENV_VARS[envVar];

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
const getApifyClientOptions = (token) => {
    if (!token && fs.existsSync(GLOBAL_CONFIGS_FOLDER) && fs.existsSync(AUTH_FILE_PATH)) {
        ({ token } = loadJson.sync(AUTH_FILE_PATH));
    }

    return {
        token,
        baseUrl: process.env.APIFY_CLIENT_BASE_URL,
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
const getLoggedClient = async (token) => {
    const apifyClient = new ApifyClient(getApifyClientOptions(token));
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
            // eslint-disable-next-line max-len
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

const setLocalEnv = async (actDir) => {
    // Create folders for emulation Apify stores
    const keyValueStorePath = getLocalKeyValueStorePath();
    const inputJsonPath = path.join(actDir, keyValueStorePath, `${KEY_VALUE_STORE_KEYS.INPUT}.json`);
    ensureFolderExistsSync(actDir, getLocalDatasetPath());
    ensureFolderExistsSync(actDir, getLocalRequestQueuePath());
    ensureFolderExistsSync(actDir, keyValueStorePath);

    // Update gitignore
    const localStorageDir = getLocalStorageDir();
    const gitingore = path.join(actDir, '.gitignore');
    if (fs.existsSync(gitingore)) {
        fs.writeFileSync(gitingore, `\n${localStorageDir}`, { flag: 'a' });
    } else {
        fs.writeFileSync(gitingore, `${localStorageDir}\nnode_modules`, { flag: 'w' });
    }

    // Create an empty INPUT.json file if it does not exist.
    if (!fs.existsSync(inputJsonPath)) {
        writeJson.sync(inputJsonPath, {});
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
    const inputFileName = files.find((file) => !!file.match(INPUT_FILE_REG_EXP));

    // No input file
    if (!inputFileName) return;

    const inputFile = fs.readFileSync(path.join(defaultLocalStorePath, inputFileName));
    const contentType = mime.getType(inputFileName);
    return { body: inputFile, contentType };
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

const outputJobLog = async (job, jobStatus, timeout) => {
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
        throw new Error('The actor name must be a DNS hostname-friendly string (e.g. my-newest-actor).');
    }
    if (actorName.length < ACTOR_NAME.MIN_LENGTH) {
        throw new Error('The actor name must be at least 3 characters long.');
    }
    if (actorName.length > ACTOR_NAME.MAX_LENGTH) {
        throw new Error('The actor name must be a maximum of 30 characters long.');
    }
};

const getPythonCommand = (directory) => {
    const pythonVenvPath = /^win/.test(process.platform)
        ? 'bin/python3.exe'
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
    return 'python3';
};

const detectPythonVersion = (directory) => {
    const pythonCommand = getPythonCommand(directory);
    try {
        return execSync(`${pythonCommand} -c "import platform; print(platform.python_version(), end='')"`, { encoding: 'utf-8' });
    } catch {
        return undefined;
    }
};

const isPythonVersionSupported = (installedPythonVersion) => {
    return semver.satisfies(installedPythonVersion, `^${MINIMUM_SUPPORTED_PYTHON_VERSION}`);
};

module.exports = {
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
};
