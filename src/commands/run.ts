import { existsSync, renameSync } from 'node:fs';
import { stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

import { APIFY_ENV_VARS } from '@apify/consts';
import { validateInputSchema, validateInputUsingValidator } from '@apify/input_schema';
import { Flags } from '@oclif/core';
import { loadJsonFile } from 'load-json-file';
import mime from 'mime';
import { minVersion } from 'semver';

import { ApifyCommand } from '../lib/apify_command.js';
import { getInputOverride } from '../lib/commands/resolve-input.js';
import {
	DEFAULT_LOCAL_STORAGE_DIR,
	LANGUAGE,
	LEGACY_LOCAL_STORAGE_DIR,
	PROJECT_TYPES,
	SUPPORTED_NODEJS_VERSION,
} from '../lib/consts.js';
import { execWithLog } from '../lib/exec.js';
import { deleteFile } from '../lib/files.js';
import { getAjvValidator, getDefaultsAndPrefillsFromInputSchema, readInputSchema } from '../lib/input_schema.js';
import { error, info, warning } from '../lib/outputs.js';
import { ProjectAnalyzer } from '../lib/project_analyzer.js';
import { ScrapyProjectAnalyzer } from '../lib/projects/scrapy/ScrapyProjectAnalyzer.js';
import { replaceSecretsValue } from '../lib/secrets.js';
import {
	Ajv,
	checkIfStorageIsEmpty,
	detectLocalActorLanguage,
	getLocalConfigOrThrow,
	getLocalInput,
	getLocalKeyValueStorePath,
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
	static override description =
		'Runs the Actor locally in the current directory.\n' +
		'It sets various APIFY_XYZ environment variables ' +
		'in order to provide a working execution environment for the Actor. For example, this causes ' +
		'the Actor input, as well as all other data in key-value stores, ' +
		`datasets or request queues to be stored in the "${DEFAULT_LOCAL_STORAGE_DIR}" directory, ` +
		'rather than on the Apify platform.\n\n' +
		'NOTE: You can override the command\'s default behavior for Node.js Actors by overriding the "start" script in the package.json file. ' +
		'You can set up your own main file or environment variables by changing it.';

	static override flags = {
		purge: Flags.boolean({
			char: 'p',
			description:
				'Shortcut that combines the --purge-queue, --purge-dataset and --purge-key-value-store options.',
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
			description:
				'Deletes all records from the default key-value store in the local directory before the run starts, except for the "INPUT" key.',
			required: false,
		}),
		entrypoint: Flags.string({
			description: [
				'Optional entrypoint for running with injected environment variables.',
				'\n',
				'For Python, it is the module name, or a path to a file.',
				'\n',
				'For node.js, it is the npm script name, or a path to a JS/MJS file.',
				'You can also pass in a directory name, provided that directory contains an "index.js" file.',
			].join(' '),
			required: false,
		}),
		input: Flags.string({
			char: 'i',
			description: 'Optional JSON input to be given to the Actor.',
			required: false,
			allowStdin: true,
			exclusive: ['input-file'],
		}),
		'input-file': Flags.string({
			aliases: ['if'],
			description:
				'Optional path to a file with JSON input to be given to the Actor. The file must be a valid JSON file. You can also specify `-` to read from standard input.',
			required: false,
			allowStdin: true,
			exclusive: ['input'],
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
		const { language, languageVersion } = detectLocalActorLanguage(cwd);

		if (!packageJsonExists && !mainPyExists && !isScrapyProject) {
			throw new Error(
				'Actor is of an unknown format.' +
					` Make sure either the 'package.json' file or 'src/__main__.py' file exists or you are in a migrated Scrapy project.`,
			);
		}

		// Defaults (for node, the start script, for python, the src module)
		let runType: RunType = language === LANGUAGE.NODEJS ? RunType.Script : RunType.Module;
		let entrypoint: string = language === LANGUAGE.NODEJS ? 'start' : 'src';

		if (this.flags.entrypoint) {
			entrypoint = this.flags.entrypoint;

			const entrypointPath = join(cwd, this.flags.entrypoint);

			const entrypointStat = await stat(entrypointPath).catch(() => null);

			// Directory -> We just try to run it as a module (in python, it needs to have a main.py file, in node.js, an index.(m)js file)
			if (entrypointStat?.isDirectory()) {
				runType = RunType.Module;
				// entrypoint -> ./src/file for example (running custom scripts)
			} else if (entrypointStat?.isFile()) {
				runType = RunType.DirectFile;
				// If it's not a file, or a directory, we just let it be a script
			} else {
				runType = RunType.Script;
			}
		}

		if (existsSync(LEGACY_LOCAL_STORAGE_DIR) && !existsSync(actualStoragePath)) {
			renameSync(LEGACY_LOCAL_STORAGE_DIR, actualStoragePath);
			warning({
				message:
					`The legacy 'apify_storage' directory was renamed to '${actualStoragePath}' to align it with Apify SDK v3.` +
					' Contents were left intact.',
			});
		}

		let CRAWLEE_PURGE_ON_START = '0';

		// Purge stores
		// TODO: this needs to be cleaned up heavily - ideally logic should be in the project analyzers
		if (this.flags.purge) {
			switch (projectType) {
				case PROJECT_TYPES.PRE_CRAWLEE_APIFY_SDK: {
					await Promise.all([purgeDefaultQueue(), purgeDefaultKeyValueStore(), purgeDefaultDataset()]);
					info({ message: 'All default local stores were purged.' });
					break;
				}
				case PROJECT_TYPES.CRAWLEE:
				default: {
					CRAWLEE_PURGE_ON_START = '1';
				}
			}

			if (language === LANGUAGE.PYTHON) {
				await Promise.all([purgeDefaultQueue(), purgeDefaultKeyValueStore(), purgeDefaultDataset()]);
				info({ message: 'All default local stores were purged.' });
			}
		}

		// TODO: deprecate these flags
		if (this.flags.purgeQueue && !this.flags.purge) {
			await purgeDefaultQueue();
			info({ message: 'Default local request queue was purged.' });
		}

		if (this.flags.purgeDataset && !this.flags.purge) {
			await purgeDefaultDataset();
			info({ message: 'Default local dataset was purged.' });
		}

		if (this.flags.purgeKeyValueStore && !this.flags.purge) {
			await purgeDefaultKeyValueStore();
			info({ message: 'Default local key-value store was purged.' });
		}

		if (!this.flags.purge) {
			const isStorageEmpty = await checkIfStorageIsEmpty();
			if (!isStorageEmpty) {
				warning({
					message:
						'The storage directory contains a previous state, the Actor will continue where it left off. ' +
						'To start from the initial state, use --purge parameter to clean the storage directory.',
				});
			}
		}

		// Select correct input and validate it
		const inputOverride = await getInputOverride(cwd, this.flags.input, this.flags.inputFile);

		// Means we couldn't resolve input, so we should exit
		if (inputOverride === false) {
			return;
		}

		const storedInputResults = await this.validateAndStoreInput(inputOverride);

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
			warning({
				message:
					'You are not logged in with your Apify Account. Some features like Apify Proxy will not work. Call "apify login" to fix that.',
			});
		}

		try {
			if (language === LANGUAGE.NODEJS) {
				// Actor is written in Node.js
				const currentNodeVersion = languageVersion;
				const minimumSupportedNodeVersion = minVersion(SUPPORTED_NODEJS_VERSION);
				if (currentNodeVersion) {
					// --max-http-header-size=80000
					// Increases default size of headers. The original limit was 80kb, but from node 10+ they decided to lower it to 8kb.
					// However they did not think about all the sites there with large headers,
					// so we put back the old limit of 80kb, which seems to work just fine.
					if (isNodeVersionSupported(currentNodeVersion)) {
						env.NODE_OPTIONS = env.NODE_OPTIONS
							? `${env.NODE_OPTIONS} --max-http-header-size=80000`
							: '--max-http-header-size=80000';
					} else {
						warning({
							message:
								`You are running Node.js version ${currentNodeVersion}, which is no longer supported. ` +
								`Please upgrade to Node.js version ${minimumSupportedNodeVersion} or later.`,
						});
					}

					this.telemetryData.actorNodejsVersion = currentNodeVersion;
					this.telemetryData.actorLanguage = LANGUAGE.NODEJS;

					// We allow "module" type directly in node too (it will work for a folder that has an `index.js` file)
					if (runType === RunType.DirectFile || runType === RunType.Module) {
						await execWithLog('node', [entrypoint], { env, cwd });
					} else {
						// TODO(vladfrangu): what is this for? Some old template maybe?
						// && !existsSync(serverJsFile)
						// const serverJsFile = join(cwd, 'server.js');
						const packageJson = await loadJsonFile<{
							scripts: Record<string, string>;
						}>(packageJsonPath);

						if (!packageJson.scripts) {
							throw new Error(
								'No scripts were found in package.json. Please set it up for your project. ' +
									'For more information about that call "apify help run".',
							);
						}

						if (!packageJson.scripts[entrypoint]) {
							throw new Error(
								`The script "${entrypoint}" was not found in package.json. Please set it up for your project. ` +
									'For more information about that call "apify help run".',
							);
						}

						await execWithLog(getNpmCmd(), ['run', entrypoint], { env, cwd });
					}
				} else {
					error({
						message: `No Node.js detected! Please install Node.js ${minimumSupportedNodeVersion} or higher to be able to run Node.js Actors locally.`,
					});
				}
			} else if (language === LANGUAGE.PYTHON) {
				const pythonVersion = languageVersion;
				this.telemetryData.actorPythonVersion = pythonVersion;
				this.telemetryData.actorLanguage = LANGUAGE.PYTHON;
				if (pythonVersion) {
					if (isPythonVersionSupported(pythonVersion)) {
						const pythonCommand = getPythonCommand(cwd);

						if (isScrapyProject && !this.flags.entrypoint) {
							const project = new ScrapyProjectAnalyzer(cwd);
							project.loadScrapyCfg();
							if (project.configuration.hasKey('apify', 'mainpy_location')) {
								entrypoint = project.configuration.get('apify', 'mainpy_location')!;
							}
						}

						if (runType === RunType.Module) {
							await execWithLog(pythonCommand, ['-m', entrypoint], {
								env,
								cwd,
							});
						} else {
							await execWithLog(pythonCommand, [entrypoint], { env, cwd });
						}
					} else {
						error({
							message: `Python Actors require Python 3.8 or higher, but you have Python ${pythonVersion}!`,
						});
						error({
							message: 'Please install Python 3.8 or higher to be able to run Python Actors locally.',
						});
					}
				} else {
					error({
						message:
							'No Python detected! Please install Python 3.8 or higher to be able to run Python Actors locally.',
					});
				}
			}
		} finally {
			if (storedInputResults) {
				if (storedInputResults.existingInput) {
					// Overwrite with the original input
					await writeFile(storedInputResults.inputFilePath, storedInputResults.existingInput.body);
				} else {
					// No file -> we made it -> we delete it
					await deleteFile(storedInputResults.inputFilePath);
				}
			}
		}
	}

	/**
	 * Ensures the input that the actor will be ran with locally matches the input schema (and prefills default values if missing)
	 * @param inputOverride Optional input received through command flags
	 */
	private async validateAndStoreInput(inputOverride?: {
		input: Record<string, unknown>;
		source: string;
	}) {
		const { inputSchema } = await readInputSchema({ cwd: process.cwd() });

		if (!inputSchema) {
			if (!inputOverride) {
				return null;
			}

			// We cannot validate input schema if it is not found -> default to no validation and overriding if flags are given
			const existingInput = getLocalInput(process.cwd());

			// Prepare the file path for where we'll temporarily store the validated input
			const inputFilePath = join(
				process.cwd(),
				getLocalKeyValueStorePath(),
				existingInput?.fileName ?? 'INPUT.json',
			);

			await writeFile(inputFilePath, JSON.stringify(inputOverride.input, null, 2));

			return {
				existingInput,
				inputFilePath,
			};
		}

		// Step 1: validate the input schema
		const validator = new Ajv({ strict: false, unicodeRegExp: false });
		validateInputSchema(validator, inputSchema); // This one throws an error in a case of invalid schema.

		const defaults = getDefaultsAndPrefillsFromInputSchema(inputSchema);
		const compiledInputSchema = getAjvValidator(inputSchema, validator);

		// Step 2: try to fetch the existing INPUT from the local storage
		const existingInput = getLocalInput(process.cwd());

		// Prepare the file path for where we'll temporarily store the validated input
		const inputFilePath = join(process.cwd(), getLocalKeyValueStorePath(), existingInput?.fileName ?? 'INPUT.json');

		let errorHeader: string;

		switch (inputOverride?.source) {
			case 'stdin':
				errorHeader =
					'The input provided through standard input is invalid. Please fix the following errors:\n';
				break;
			case 'input':
				errorHeader =
					'The input provided through the --input flag is invalid. Please fix the following errors:\n';
				break;
			default:
				if (inputOverride) {
					errorHeader = `The input provided through the ${inputOverride.source} file is invalid. Please fix the following errors:\n`;
				} else {
					errorHeader = 'The input in your storage is invalid. Please fix the following errors:\n';
				}
				break;
		}

		// Step 2. If there is an input override, we validate it and store it
		if (inputOverride) {
			const fullInputOverride = {
				...defaults,
				...inputOverride.input,
			};

			const errors = validateInputUsingValidator(compiledInputSchema, inputSchema, fullInputOverride);

			if (errors.length > 0) {
				throw new Error(
					`${errorHeader}${errors
						.map((e) => `  - ${e.message.replace('Field input.', 'Field ')}`)
						.join('\n')}`,
				);
			}

			await writeFile(inputFilePath, JSON.stringify(fullInputOverride, null, 2));

			return {
				existingInput,
				inputFilePath,
			};
		}

		if (!existingInput) {
			// No input -> use defaults for this run
			await writeFile(inputFilePath, JSON.stringify(defaults, null, 2));

			return {
				existingInput,
				inputFilePath,
			};
		}

		if (mime.getExtension(existingInput.contentType!) === 'json') {
			// Step 4: validate the input
			const inputJson = JSON.parse(existingInput.body.toString('utf-8'));

			if (Array.isArray(inputJson)) {
				throw new Error('The input in your storage is invalid. It should be an object, not an array.');
			}

			const fullInput = {
				...defaults,
				...inputJson,
			};

			const errors = validateInputUsingValidator(compiledInputSchema, inputSchema, fullInput);

			if (errors.length > 0) {
				throw new Error(
					`${errorHeader}${errors
						.map((e) => `  - ${e.message.replace('Field input.', 'Field ')}`)
						.join('\n')}`,
				);
			}

			// Step 4: store the input
			await writeFile(inputFilePath, JSON.stringify(fullInput, null, 2));

			return {
				existingInput,
				inputFilePath,
			};
		}

		return null;
	}
}

enum RunType {
	DirectFile = 0,
	Module = 1,
	Script = 2,
}
