import { existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

import { APIFY_ENV_VARS } from '@apify/consts';
import { Flags } from '@oclif/core';
import { loadJsonFile } from 'load-json-file';
import { minVersion } from 'semver';

import { ApifyCommand } from '../lib/apify_command.js';
import { DEFAULT_LOCAL_STORAGE_DIR, LANGUAGE, LEGACY_LOCAL_STORAGE_DIR, PROJECT_TYPES, SUPPORTED_NODEJS_VERSION } from '../lib/consts.js';
import { execWithLog } from '../lib/exec.js';
import { error, info, warning } from '../lib/outputs.js';
import { ProjectAnalyzer } from '../lib/project_analyzer.js';
import { ScrapyProjectAnalyzer } from '../lib/projects/scrapy/ScrapyProjectAnalyzer.js';
import { replaceSecretsValue } from '../lib/secrets.js';
import {
    checkIfStorageIsEmpty,
    detectLocalActorLanguage,
    getLocalConfigOrThrow,
    getLocalStorageDir,
    getLocalUserInfo,
    getNpmCmd,
    getPythonCommand,
    isNodeVersionSupported,
    isPythonVersionSupported,
    purgeDefaultDataset,
    purgeDefaultKeyValueStore,
    purgeDefaultQueue,
} from '../lib/utils.js';

export class RunCommand extends ApifyCommand<typeof RunCommand> {
    static override description = 'Runs the Actor locally in the current directory.\n'
        + 'It sets various APIFY_XYZ environment variables '
        + 'in order to provide a working execution environment for the Actor. For example, this causes '
        + 'the Actor input, as well as all other data in key-value stores, '
        + `datasets or request queues to be stored in the "${DEFAULT_LOCAL_STORAGE_DIR}" directory, `
        + 'rather than on the Apify platform.\n\n'
        + 'NOTE: You can override the command\'s default behavior for Node.js Actors by overriding the "start" script in the package.json file. '
        + 'You can set up your own main file or environment variables by changing it.';

    static override flags = {
        purge: Flags.boolean({
            char: 'p',
            description: 'Shortcut that combines the --purge-queue, --purge-dataset and --purge-key-value-store options.',
            required: false,
        }),
        'purge-queue': Flags.boolean({
            description: 'Deletes the local directory containing the default request queue before the run starts.',
            required: false,
        }),
        'purge-dataset': Flags.boolean({
            description: 'Deletes the local directory containing the default dataset before the run starts.',
            required: false,
        }),
        'purge-key-value-store': Flags.boolean({
            description: 'Deletes all records from the default key-value store in the local directory before the run starts, except for the "INPUT" key.',
            required: false,
        }),
    };

    async run() {
        const cwd = process.cwd();
        const { proxy, id: userId, token } = await getLocalUserInfo();
        const localConfig = await getLocalConfigOrThrow(cwd);

        const packageJsonPath = join(cwd, 'package.json');
        const mainPyPath = join(cwd, 'src/__main__.py');

        const projectType = ProjectAnalyzer.getProjectType(cwd);
        const actualStoragePath = getLocalStorageDir();

        const packageJsonExists = existsSync(packageJsonPath);
        const mainPyExists = existsSync(mainPyPath);
        const isScrapyProject = projectType === PROJECT_TYPES.SCRAPY;

        if (!packageJsonExists && !mainPyExists && !isScrapyProject) {
            throw new Error(
                'Actor is of an unknown format.'
                + ` Make sure either the 'package.json' file or 'src/__main__.py' file exists or you are in a migrated Scrapy project.`,
            );
        }

        if (existsSync(LEGACY_LOCAL_STORAGE_DIR) && !existsSync(actualStoragePath)) {
            renameSync(LEGACY_LOCAL_STORAGE_DIR, actualStoragePath);
            warning(`The legacy 'apify_storage' directory was renamed to '${actualStoragePath}' to align it with Apify SDK v3.`
                + ' Contents were left intact.');
        }

        let CRAWLEE_PURGE_ON_START = '0';

        // Purge stores
        if (this.flags.purge) {
            switch (projectType) {
                case PROJECT_TYPES.CRAWLEE: {
                    CRAWLEE_PURGE_ON_START = '1';
                    break;
                }
                case PROJECT_TYPES.PRE_CRAWLEE_APIFY_SDK: {
                    await Promise.all([purgeDefaultQueue(), purgeDefaultKeyValueStore(), purgeDefaultDataset()]);
                    info('All default local stores were purged.');
                    break;
                }
                default: {
                    // TODO: Python SDK too
                }
            }
        }

        // TODO: deprecate these flags
        if (this.flags.purgeQueue) {
            await purgeDefaultQueue();
            info('Default local request queue was purged.');
        }

        if (this.flags.purgeDataset) {
            await purgeDefaultDataset();
            info('Default local dataset was purged.');
        }

        if (this.flags.purgeKeyValueStore) {
            await purgeDefaultKeyValueStore();
            info('Default local key-value store was purged.');
        }

        if (!this.flags.purge) {
            const isStorageEmpty = await checkIfStorageIsEmpty();
            if (!isStorageEmpty) {
                warning('The storage directory contains a previous state, the Actor will continue where it left off. '
                    + 'To start from the initial state, use --purge parameter to clean the storage directory.');
            }
        }

        // Attach env vars from local config files
        const localEnvVars: Record<string, string> = {
            [APIFY_ENV_VARS.LOCAL_STORAGE_DIR]: actualStoragePath,
            CRAWLEE_STORAGE_DIR: actualStoragePath,
            CRAWLEE_PURGE_ON_START,
        };
        if (proxy && proxy.password) localEnvVars[APIFY_ENV_VARS.PROXY_PASSWORD] = proxy.password;
        if (userId) localEnvVars[APIFY_ENV_VARS.USER_ID] = userId;
        if (token) localEnvVars[APIFY_ENV_VARS.TOKEN] = token;
        if (localConfig!.environmentVariables) {
            const updatedEnv = replaceSecretsValue(localConfig!.environmentVariables as Record<string, string>);
            Object.assign(localEnvVars, updatedEnv);
        }
        // NOTE: User can overwrite env vars
        const env = Object.assign(localEnvVars, process.env);

        if (!userId) {
            warning('You are not logged in with your Apify Account. Some features like Apify Proxy will not work. Call "apify login" to fix that.');
        }

        const { language, languageVersion } = detectLocalActorLanguage(cwd);
        if (language === LANGUAGE.NODEJS) { // Actor is written in Node.js
            const currentNodeVersion = languageVersion;
            const minimumSupportedNodeVersion = minVersion(SUPPORTED_NODEJS_VERSION);
            if (currentNodeVersion) {
                const serverJsFile = join(cwd, 'server.js');
                const packageJson = await loadJsonFile<{ scripts: Record<string, string > }>(packageJsonPath);
                if ((!packageJson.scripts || !packageJson.scripts.start) && !existsSync(serverJsFile)) {
                    throw new Error('The "npm start" script was not found in package.json. Please set it up for your project. '
                        + 'For more information about that call "apify help run".');
                }

                // --max-http-header-size=80000
                // Increases default size of headers. The original limit was 80kb, but from node 10+ they decided to lower it to 8kb.
                // However they did not think about all the sites there with large headers,
                // so we put back the old limit of 80kb, which seems to work just fine.
                if (isNodeVersionSupported(currentNodeVersion)) {
                    env.NODE_OPTIONS = env.NODE_OPTIONS ? `${env.NODE_OPTIONS} --max-http-header-size=80000` : '--max-http-header-size=80000';
                } else {
                    warning(`You are running Node.js version ${currentNodeVersion}, which is no longer supported. `
                        + `Please upgrade to Node.js version ${minimumSupportedNodeVersion} or later.`);
                }
                this.telemetryData.actorNodejsVersion = currentNodeVersion;
                this.telemetryData.actorLanguage = LANGUAGE.NODEJS;
                await execWithLog(getNpmCmd(), ['start'], { env, cwd });
            } else {
                error(`No Node.js detected! Please install Node.js ${minimumSupportedNodeVersion} or higher to be able to run Node.js Actors locally.`);
            }
        } else if (language === LANGUAGE.PYTHON) {
            const pythonVersion = languageVersion;
            this.telemetryData.actorPythonVersion = pythonVersion;
            this.telemetryData.actorLanguage = LANGUAGE.PYTHON;
            if (pythonVersion) {
                if (isPythonVersionSupported(pythonVersion)) {
                    const pythonCommand = getPythonCommand(cwd);
                    let executableLocation = 'src';

                    if (isScrapyProject) {
                        const project = new ScrapyProjectAnalyzer(cwd);
                        project.loadScrapyCfg();
                        if (project.configuration.hasKey('apify', 'mainpy_location')) {
                            executableLocation = project.configuration.get('apify', 'mainpy_location')!;
                        }
                    }

                    await execWithLog(pythonCommand, ['-m', executableLocation], { env, cwd });
                } else {
                    error(`Python Actors require Python 3.8 or higher, but you have Python ${pythonVersion}!`);
                    error('Please install Python 3.8 or higher to be able to run Python Actors locally.');
                }
            } else {
                error('No Python detected! Please install Python 3.8 or higher to be able to run Python Actors locally.');
            }
        }
    }
}
