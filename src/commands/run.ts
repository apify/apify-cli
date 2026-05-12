import { existsSync, renameSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import process from 'node:process';

import type { ExecaError } from 'execa';
import mime from 'mime';
import { minVersion } from 'semver';

import { ACTOR_ENV_VARS, APIFY_ENV_VARS } from '@apify/consts';
import { validateInputSchema, validateInputUsingValidator } from '@apify/input_schema';

import { ApifyCommand, StdinMode } from '../lib/command-framework/apify-command.js';
import { Flags } from '../lib/command-framework/flags.js';
import { getInputOverride } from '../lib/commands/resolve-input.js';
import {
	CommandExitCodes,
	DEFAULT_LOCAL_STORAGE_DIR,
	INTERRUPT_SIGNALS,
	LEGACY_LOCAL_STORAGE_DIR,
	MINIMUM_SUPPORTED_PYTHON_VERSION,
	SUPPORTED_NODEJS_VERSION,
} from '../lib/consts.js';
import { execWithLog } from '../lib/exec.js';
import { deleteFile } from '../lib/files.js';
import { useActorConfig } from '../lib/hooks/useActorConfig.js';
import { ProjectLanguage, useCwdProject } from '../lib/hooks/useCwdProject.js';
import { useModuleVersion } from '../lib/hooks/useModuleVersion.js';
import { CRAWLEE_INPUT_KEY_ENV, resolveInputKey, TEMP_INPUT_KEY_PREFIX } from '../lib/input-key.js';
import { getAjvValidator, getDefaultsFromInputSchema, readInputSchema } from '../lib/input_schema.js';
import { replaceSecretsValue } from '../lib/secrets.js';
import {
	Ajv2019,
	checkIfStorageIsEmpty,
	getLocalInput,
	getLocalKeyValueStorePath,
	getLocalStorageDir,
	getLocalUserInfo,
	isNodeVersionSupported,
	isPythonVersionSupported,
	purgeDefaultDataset,
	purgeDefaultKeyValueStore,
	purgeDefaultQueue,
} from '../lib/utils.js';

import { RunCommandMessages } from '#i18n/commands/run.js';

interface TempInputResult {
	tempInputKey: string;
	tempInputFilePath: string;
}

interface OverwrittenInputResult {
	existingInput: ReturnType<typeof getLocalInput>;
	inputFilePath: string;
	writtenAt: number;
}

type ValidateAndStoreInputResult = TempInputResult | OverwrittenInputResult;

enum RunType {
	DirectFile = 0,
	Module = 1,
	Script = 2,
}

export class RunCommand extends ApifyCommand<typeof RunCommand> {
	static override name = 'run' as const;

	static override description =
		`Executes Actor locally with simulated Apify environment variables.\n` +
		`Stores data in local '${DEFAULT_LOCAL_STORAGE_DIR}' directory.\n\n` +
		`NOTE: For Node.js Actors, customize behavior by modifying the 'start' script in package.json file.`;

	static override group = 'Local Actor Development';

	static override examples = [
		{
			description: 'Run the Actor in the current directory with the stored input.',
			command: 'apify run',
		},
		{
			description: 'Run and purge the default storage first (dataset, request queue, key-value store).',
			command: 'apify run --purge',
		},
		{
			description: 'Run with inline JSON input (overrides the stored INPUT).',
			command: `apify run --input '{"startUrls":[{"url":"https://example.com"}]}'`,
		},
		{
			description: 'Run with input from a file.',
			command: 'apify run --input-file ./input.json',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-run';

	static override flags = {
		purge: Flags.boolean({
			char: 'p',
			description:
				'Whether to purge the default request queue, dataset and key-value store before the run starts.\nFor crawlee projects, this is the default behavior, and the flag is optional.\nUse `--no-purge` to keep the storage folder intact.',
			required: false,
			default: true,
			exclusive: ['resurrect'],
		}),
		resurrect: Flags.boolean({
			description: 'Whether to keep the default request queue, dataset and key-value store before the run starts.',
			required: false,
			default: false,
			exclusive: ['purge'],
		}),
		entrypoint: Flags.string({
			description: [
				'Optional entrypoint for running with injected environment variables.',
				'\n',
				'For Python, it is the module name, or a path to a file.',
				'\n',
				'For Node.js, it is the npm script name, or a path to a JS/MJS file.',
				'You can also pass in a directory name, provided that directory contains an "index.js" file.',
			].join(' '),
			required: false,
		}),
		input: Flags.string({
			char: 'i',
			description: 'Optional JSON input to be given to the Actor.',
			required: false,
			stdin: StdinMode.Stringified,
			exclusive: ['input-file'],
		}),
		'input-file': Flags.string({
			aliases: ['if'],
			description:
				'Optional path to a file with JSON input to be given to the Actor. The file must be a valid JSON file. You can also specify `-` to read from standard input.',
			required: false,
			stdin: StdinMode.Stringified,
			exclusive: ['input'],
		}),
		'allow-missing-secrets': Flags.boolean({
			description: 'Allow the command to continue even when secret values are not found in the local secrets storage.',
			required: false,
			default: false,
		}),
	};

	async run() {
		const cwd = process.cwd();

		const { proxy, id: userId, token } = await getLocalUserInfo();

		const localConfigResult = await useActorConfig({ cwd });

		if (localConfigResult.isErr()) {
			const { message, cause } = localConfigResult.unwrapErr();

			this.logger.stderr.error(
				cause ? this.t(RunCommandMessages.actorConfigErrorWithCause, { message, cause: cause.message }) : message,
			);
			process.exitCode = CommandExitCodes.InvalidActorJson;
			return;
		}

		const { config: localConfig } = localConfigResult.unwrap();

		const actualStoragePath = getLocalStorageDir();
		const resolvedInputKey = resolveInputKey();

		const projectRuntimeResult = await useCwdProject({ cwd });

		if (projectRuntimeResult.isErr()) {
			this.logger.stderr.error(projectRuntimeResult.unwrapErr().message);
			process.exitCode = CommandExitCodes.InvalidActorJson;
			return;
		}

		const project = projectRuntimeResult.unwrap();
		const { type, entrypoint: cwdEntrypoint, runtime } = project;

		if (project.warnings?.length) {
			for (const w of project.warnings) {
				this.logger.stderr.warning(w);
			}
		}

		if (type === ProjectLanguage.Unknown) {
			throw new Error(this.t(RunCommandMessages.unknownProjectFormat));
		}

		if (!runtime) {
			switch (type) {
				case ProjectLanguage.JavaScript:
					this.logger.stderr.error(
						this.t(RunCommandMessages.noNodeRuntime, { supportedVersion: SUPPORTED_NODEJS_VERSION }),
					);
					break;
				case ProjectLanguage.Scrapy:
				case ProjectLanguage.Python:
					this.logger.stderr.error(
						this.t(RunCommandMessages.noPythonRuntime, {
							supportedVersion: MINIMUM_SUPPORTED_PYTHON_VERSION,
						}),
					);
					break;
				default:
					this.logger.stderr.error(
						this.t(RunCommandMessages.noRuntime, {
							pythonVersion: MINIMUM_SUPPORTED_PYTHON_VERSION,
							nodeVersion: SUPPORTED_NODEJS_VERSION,
						}),
					);
			}

			return;
		}

		let runType: RunType;
		let entrypoint: string;

		if (this.flags.entrypoint) {
			entrypoint = this.flags.entrypoint;

			const entrypointPath = join(cwd, this.flags.entrypoint);

			const entrypointStat = await stat(entrypointPath).catch(() => null);

			if (entrypointStat?.isDirectory()) {
				// Directory -> We just try to run it as a module (in python, it needs to have a main.py file, in node.js, an index.(m)js file)
				runType = RunType.Module;
			}
			// File -> ./src/file for example (running custom scripts)
			else if (entrypointStat?.isFile()) {
				runType = RunType.DirectFile;
			}
			// If it's not a file, or a directory, we just let it be a script
			else {
				runType = RunType.Script;
			}
		} else if (cwdEntrypoint?.script) {
			runType = RunType.Script;
			entrypoint = cwdEntrypoint.script;
		} else if (cwdEntrypoint?.path) {
			runType = type !== ProjectLanguage.JavaScript ? RunType.Module : RunType.DirectFile;
			entrypoint = cwdEntrypoint.path;
		} else {
			this.logger.stderr.error(this.t(RunCommandMessages.noEntrypoint));

			return;
		}

		if (existsSync(LEGACY_LOCAL_STORAGE_DIR) && !existsSync(actualStoragePath)) {
			renameSync(LEGACY_LOCAL_STORAGE_DIR, actualStoragePath);
			this.logger.stderr.warning(this.t(RunCommandMessages.legacyStorageRenamed, { storagePath: actualStoragePath }));
		}

		const crawleeVersion = await useModuleVersion({
			moduleName: 'crawlee',
			project,
		});

		let CRAWLEE_PURGE_ON_START = '0';

		// Mark resurrect as a special case of --no-purge
		if (this.flags.resurrect) {
			this.flags.purge = false;
		}

		// Purge stores
		if (this.flags.purge) {
			CRAWLEE_PURGE_ON_START = '1';

			if (crawleeVersion.isNone()) {
				await Promise.all([purgeDefaultQueue(), purgeDefaultKeyValueStore(resolvedInputKey), purgeDefaultDataset()]);
				this.logger.stderr.info(this.t(RunCommandMessages.storesPurged));
			}
		}

		if (!this.flags.purge) {
			const isStorageEmpty = await checkIfStorageIsEmpty(resolvedInputKey);

			if (!isStorageEmpty && !this.flags.resurrect) {
				this.logger.stderr.warning(this.t(RunCommandMessages.storageNotEmpty));
			}
		}

		// Select correct input and validate it
		const inputOverride = await getInputOverride(cwd, this.flags.input, this.flags.inputFile);

		// Means we couldn't resolve input, so we should exit
		if (inputOverride === false) {
			return;
		}

		const storedInputResults = await this.validateAndStoreInput(inputOverride, resolvedInputKey);

		// When a temp input file was created, disable crawlee's purge so it doesn't
		// delete the temp file (its name doesn't match the input key regex that purge skips).
		// Also determine the effective input key for env vars (temp key overrides resolved key).
		let effectiveInputKey = resolvedInputKey;
		if (storedInputResults && 'tempInputKey' in storedInputResults) {
			if (this.flags.purge && crawleeVersion.isSome()) {
				// Crawlee would have purged on start, but we need to disable that to protect
				// the temp file. Purge from CLI side instead, preserving both input files.
				await Promise.all([
					purgeDefaultQueue(),
					purgeDefaultKeyValueStore(resolvedInputKey, storedInputResults.tempInputKey),
					purgeDefaultDataset(),
				]);
			}
			CRAWLEE_PURGE_ON_START = '0';
			effectiveInputKey = storedInputResults.tempInputKey;
		}

		// Attach env vars from local config files.
		// Set all three input key env vars so both Node.js and Python SDKs pick up the resolved key.
		const localEnvVars: Record<string, string> = {
			[APIFY_ENV_VARS.LOCAL_STORAGE_DIR]: actualStoragePath,
			CRAWLEE_STORAGE_DIR: actualStoragePath,
			CRAWLEE_PURGE_ON_START,
			[ACTOR_ENV_VARS.INPUT_KEY]: effectiveInputKey,
			[APIFY_ENV_VARS.INPUT_KEY]: effectiveInputKey,
			[CRAWLEE_INPUT_KEY_ENV]: effectiveInputKey,
		};

		if (proxy && proxy.password) localEnvVars[APIFY_ENV_VARS.PROXY_PASSWORD] = proxy.password;
		if (userId) localEnvVars[APIFY_ENV_VARS.USER_ID] = userId;
		if (token) localEnvVars[APIFY_ENV_VARS.TOKEN] = token;
		if (localConfig!.environmentVariables) {
			const updatedEnv = replaceSecretsValue(localConfig!.environmentVariables as Record<string, string>, undefined, {
				allowMissing: this.flags.allowMissingSecrets,
			});
			Object.assign(localEnvVars, updatedEnv);
		}

		// localEnvVars must take priority so the CLI can redirect the SDK to temp input files
		const env = { ...process.env, ...localEnvVars };

		if (!userId) {
			this.logger.stderr.warning(this.t(RunCommandMessages.notLoggedIn));
		}

		try {
			switch (type) {
				case ProjectLanguage.JavaScript: {
					const minimumSupportedNodeVersion = minVersion(SUPPORTED_NODEJS_VERSION);

					if (isNodeVersionSupported(runtime.version)) {
						// --max-http-header-size=80000
						// Increases default size of headers. The original limit was 80kb, but from node 10+ they decided to lower it to 8kb.
						// However they did not think about all the sites there with large headers,
						// so we put back the old limit of 80kb, which seems to work just fine.
						env.NODE_OPTIONS = env.NODE_OPTIONS
							? `${env.NODE_OPTIONS} --max-http-header-size=80000`
							: '--max-http-header-size=80000';
					} else {
						this.logger.stderr.warning(
							this.t(RunCommandMessages.unsupportedNodeVersion, {
								currentVersion: runtime.version,
								minimumVersion: String(minimumSupportedNodeVersion),
							}),
						);
					}

					if (runType === RunType.DirectFile || runType === RunType.Module) {
						await execWithLog({
							cmd: runtime.executablePath,
							args: [entrypoint],
							opts: { env, cwd },
							forwardSignals: INTERRUPT_SIGNALS,
						});
					} else {
						// Assert the package.json content for scripts
						const packageJson = await readFile(join(cwd, 'package.json'), 'utf8').catch(() => '{}');
						const packageJsonObj = JSON.parse(packageJson);

						if (!packageJsonObj.scripts) {
							throw new Error(this.t(RunCommandMessages.noScriptsInPackageJson));
						}

						if (!packageJsonObj.scripts[entrypoint]) {
							throw new Error(this.t(RunCommandMessages.scriptNotFound, { entrypoint }));
						}

						if (!runtime.pmPath) {
							throw new Error(this.t(RunCommandMessages.noNpmExecutable));
						}

						await execWithLog({
							cmd: runtime.pmPath,
							args: ['run', entrypoint],
							opts: { env, cwd },
							overrideCommand: runtime.pmName,
							forwardSignals: INTERRUPT_SIGNALS,
						});
					}

					break;
				}
				case ProjectLanguage.Python:
				case ProjectLanguage.Scrapy: {
					if (!isPythonVersionSupported(runtime.version)) {
						this.logger.stderr.error(
							this.t(RunCommandMessages.pythonVersionTooLow, { currentVersion: runtime.version }),
						);
						this.logger.stderr.error(this.t(RunCommandMessages.pleaseInstallPython));

						return;
					}

					if (runType === RunType.Module) {
						await execWithLog({
							cmd: runtime.executablePath,
							args: ['-m', entrypoint],
							opts: { env, cwd },
							forwardSignals: INTERRUPT_SIGNALS,
						});
					} else {
						await execWithLog({
							cmd: runtime.executablePath,
							args: [entrypoint],
							opts: { env, cwd },
							forwardSignals: INTERRUPT_SIGNALS,
						});
					}

					break;
				}
				default:
					this.logger.stderr.error(this.t(RunCommandMessages.failedToDetectLanguage));
			}
		} catch (err) {
			const { stderr } = err as ExecaError;

			if (stderr) {
				// TODO: maybe throw in helpful tips for debugging issues (missing scripts, trying to start a ts file with old node, etc)
			}
		} finally {
			if (storedInputResults) {
				if ('tempInputKey' in storedInputResults) {
					// Temp input file: just delete it, user's INPUT.json was never touched
					await deleteFile(storedInputResults.tempInputFilePath);
				} else if (storedInputResults.existingInput) {
					// Check if the input file was modified since we modified it. If it was, we abort the re-overwrite and warn the user
					const stats = await stat(storedInputResults.inputFilePath);

					const mtime = Math.trunc(stats.mtimeMs);

					// If its in a 5ms range, we assume the file was modified (realistically impossible)
					if (mtime - storedInputResults.writtenAt >= 5) {
						this.logger.stderr.warning(
							this.t(RunCommandMessages.inputFileOverwritten, {
								filePath: storedInputResults.inputFilePath,
							}),
						);

						// eslint-disable-next-line no-unsafe-finally -- we do not return anything in the commands anyways
						return;
					}

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
	 * Validates the input against the input schema and writes to disk only when necessary.
	 * When the user already has an input file and no override is provided, it writes the
	 * merged defaults to a separate temp file so the user's file is never touched.
	 * The caller redirects the SDK to the temp file via the ACTOR_INPUT_KEY env var.
	 * @param inputOverride Optional input received through command flags
	 * @param resolvedInputKey The input key resolved from env vars (default "INPUT")
	 */
	private async validateAndStoreInput(
		inputOverride?: { input: Record<string, unknown>; source: string },
		resolvedInputKey = 'INPUT',
	): Promise<ValidateAndStoreInputResult | null> {
		const { inputSchema } = await readInputSchema({ cwd: process.cwd() });

		if (!inputSchema) {
			if (!inputOverride) {
				return null;
			}

			// We cannot validate input schema if it is not found -> default to no validation and overriding if flags are given
			// Write the override to a temp file so the user's input file is never touched.
			const defaultStorePath = join(process.cwd(), getLocalKeyValueStorePath());
			await mkdir(defaultStorePath, { recursive: true });

			const tempInputKey = `${TEMP_INPUT_KEY_PREFIX}${resolvedInputKey}`;
			const tempInputFilePath = join(defaultStorePath, `${tempInputKey}.json`);

			await writeFile(tempInputFilePath, JSON.stringify(inputOverride.input, null, 2));

			return {
				tempInputKey,
				tempInputFilePath,
			};
		}

		// Step 1: validate the input schema
		const validator = new Ajv2019({ strict: false, unicodeRegExp: false });
		validateInputSchema(validator, inputSchema); // This one throws an error in a case of invalid schema.

		const defaults = getDefaultsFromInputSchema(inputSchema);
		const compiledInputSchema = getAjvValidator(inputSchema, validator);

		// Step 2: try to fetch the existing input from the local storage
		const existingInput = getLocalInput(process.cwd(), resolvedInputKey);

		// Prepare the file path for where we'll temporarily store the validated input
		const inputFilePath = join(
			process.cwd(),
			getLocalKeyValueStorePath(),
			existingInput?.fileName ?? `${resolvedInputKey}.json`,
		);

		let errorHeader: string;

		switch (inputOverride?.source) {
			case 'stdin':
				errorHeader = this.t(RunCommandMessages.stdinInputInvalid);
				break;
			case 'input':
				errorHeader = this.t(RunCommandMessages.flagInputInvalid);
				break;
			default:
				if (inputOverride) {
					errorHeader = this.t(RunCommandMessages.fileInputInvalid, { source: inputOverride.source });
				} else {
					errorHeader = this.t(RunCommandMessages.storedInputInvalid);
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
					this.t(RunCommandMessages.invalidInputErrors, {
						header: errorHeader,
						errors: errors.map((e) => `  - ${e.message.replace('Field input.', 'Field ')}`).join('\n'),
					}),
				);
			}

			// Write to a temp file so the user's input file is never touched.
			const tempInputKey = `${TEMP_INPUT_KEY_PREFIX}${resolvedInputKey}`;
			const tempInputFilePath = join(dirname(inputFilePath), `${tempInputKey}.json`);

			await mkdir(dirname(inputFilePath), { recursive: true });
			await writeFile(tempInputFilePath, JSON.stringify(fullInputOverride, null, 2));

			return {
				tempInputKey,
				tempInputFilePath,
			};
		}

		if (!existingInput) {
			await mkdir(dirname(inputFilePath), { recursive: true });
			// No input -> use defaults for this run
			await writeFile(inputFilePath, JSON.stringify(defaults, null, 2));

			return {
				existingInput,
				inputFilePath,
				writtenAt: Date.now(),
			};
		}

		if (mime.getExtension(existingInput.contentType!) === 'json') {
			// Step 4: validate the input
			const inputJson = JSON.parse(existingInput.body.toString('utf-8'));

			if (Array.isArray(inputJson)) {
				throw new Error(this.t(RunCommandMessages.storedInputNotObject));
			}

			const fullInput = {
				...defaults,
				...inputJson,
			};

			const errors = validateInputUsingValidator(compiledInputSchema, inputSchema, fullInput);

			if (errors.length > 0) {
				throw new Error(
					this.t(RunCommandMessages.invalidInputErrors, {
						header: errorHeader,
						errors: errors.map((e) => `  - ${e.message.replace('Field input.', 'Field ')}`).join('\n'),
					}),
				);
			}

			// Write merged input to a temp file so the user's INPUT.json is never touched.
			// The SDK is redirected to this file via the ACTOR_INPUT_KEY env var.
			const tempInputKey = `${TEMP_INPUT_KEY_PREFIX}${resolvedInputKey}`;
			const tempInputFilePath = join(dirname(inputFilePath), `${tempInputKey}.json`);

			await writeFile(tempInputFilePath, JSON.stringify(fullInput, null, 2));

			return {
				tempInputKey,
				tempInputFilePath,
			};
		}

		return null;
	}
}
