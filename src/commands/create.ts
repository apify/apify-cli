import { mkdir, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

import { gte, minVersion } from 'semver';
import which from 'which';

import { fetchManifest, manifestUrl } from '@apify/actor-templates';

import { ApifyCommand } from '../lib/command-framework/apify-command.js';
import { Args } from '../lib/command-framework/args.js';
import { Flags } from '../lib/command-framework/flags.js';
import {
	EMPTY_LOCAL_CONFIG,
	LOCAL_CONFIG_PATH,
	MINIMUM_SUPPORTED_PYTHON_VERSION,
	PYTHON_VENV_PATH,
	SUPPORTED_NODEJS_VERSION,
} from '../lib/consts.js';
import {
	buildNextSteps,
	enhanceReadmeWithLocalSuffix,
	ensureValidActorName,
	formatCreateSuccessMessage,
	getTemplateDefinition,
} from '../lib/create-utils.js';
import { execWithLog } from '../lib/exec.js';
import { updateLocalJson } from '../lib/files.js';
import { usePythonRuntime } from '../lib/hooks/runtimes/python.js';
import { getInstallCommandSuggestion } from '../lib/hooks/runtimes/utils.js';
import { ProjectLanguage, useCwdProject } from '../lib/hooks/useCwdProject.js';
import { createPrefilledInputFileFromInputSchema } from '../lib/input_schema.js';
import { error, info, simpleLog, success, warning } from '../lib/outputs.js';
import { LANGUAGE_FLAG_CHOICES, USE_CASE_FLAG_CHOICES } from '../lib/templates/consts.js';
import {
	downloadAndUnzip,
	getJsonFileContent,
	isNodeVersionSupported,
	isPythonVersionSupported,
	printJsonToStdout,
	setLocalConfig,
	setLocalEnv,
} from '../lib/utils.js';

export class CreateCommand extends ApifyCommand<typeof CreateCommand> {
	static override name = 'create' as const;

	static override description =
		'Creates an Actor project from a template in a new directory. The command automatically initializes a git repository in the newly created Actor directory.';

	static override group = 'Local Actor Development';

	static override interactive = true;

	static override interactiveNote =
		'Prompts for an Actor name, then guides you through what you want to build, a language, and a template when they are not provided. To run non-interactively, pass the name and --template. Use --use-case and --language to narrow the template list.';

	static override examples = [
		{
			description: 'Create a new Actor project interactively (guided name, use case, language, and template prompts).',
			command: 'apify create',
		},
		{
			description: 'Narrow the guided template list by use case and language.',
			command: 'apify create my-actor --use-case web-scraper --language python',
		},
		{
			description: 'Create non-interactively with explicit name and template.',
			command: 'apify create my-actor --template js-crawlee-cheerio',
		},
		{
			description: 'Create without installing dependencies (faster; run install yourself later).',
			command: 'apify create my-actor --template python-start --skip-dependency-install',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-create';

	static override flags = {
		template: Flags.string({
			char: 't',
			description: `Template for the Actor. If not provided, the command will prompt for it. Visit ${manifestUrl} to find available template names.`,
			required: false,
		}),
		'use-case': Flags.string({
			char: 'u',
			description:
				'Filter templates by use case. Ignored when --template is provided. To see the use cases each template supports, run "apify templates ls".',
			choices: USE_CASE_FLAG_CHOICES,
			required: false,
		}),
		language: Flags.string({
			char: 'l',
			description: 'Filter templates by programming language. Ignored when --template is provided.',
			choices: LANGUAGE_FLAG_CHOICES,
			required: false,
		}),
		'skip-dependency-install': Flags.boolean({
			description: 'Skip installing Actor dependencies.',
			required: false,
		}),
		'template-archive-url': Flags.string({
			description: 'Actor template archive url. Useful for developing new templates.',
			required: false,
			hidden: true,
		}),
		'omit-optional-deps': Flags.boolean({
			aliases: ['no-optional'],
			description: 'Skip installing optional dependencies.',
			required: false,
		}),
		'skip-git-init': Flags.boolean({
			description: 'Skip initializing a git repository in the Actor directory.',
			required: false,
		}),
		origin: Flags.string({
			description: 'Where the command was invoked from. Used for funnel telemetry.',
			choices: ['console', 'cli'],
			default: 'cli',
			required: false,
			hidden: true,
		}),
	};

	static override args = {
		actorName: Args.string({
			required: false,
			description: 'Name of the Actor and its directory.',
		}),
	};

	static override enableJsonFlag = true;

	async run() {
		let { actorName } = this.args;
		const { template: templateName, useCase, language, skipDependencyInstall, skipGitInit, origin, json } = this.flags;

		// --template-archive-url is an internal, undocumented flag that's used
		// for testing of templates that are not yet published in the manifest
		let { templateArchiveUrl } = this.flags;
		let skipOptionalDeps = false;

		// `--json` implies non-interactive: a caller parsing stdout cannot answer a prompt. Reject
		// before creating any directories so a failed run leaves nothing behind.
		if (json && !actorName) {
			throw new Error('--json runs non-interactively. Pass the Actor name as an argument.');
		}

		if (json && !templateName && !templateArchiveUrl) {
			throw new Error(
				'--json runs non-interactively. Pass --template <name>; run `apify templates ls` to list values.',
			);
		}

		// Start fetching manifest immediately to prevent
		// annoying delays that sometimes happen on CLI startup.
		const manifestPromise = fetchManifest().catch((err) => {
			return new Error(`Could not fetch template list from server. Cause: ${err?.message}`);
		});

		actorName = await ensureValidActorName(actorName);

		const cwd = process.cwd();
		let actFolderDir = join(cwd, actorName);

		while (true) {
			const folderExists = await stat(actFolderDir).catch(() => null);
			const folderHasFiles =
				folderExists &&
				(await readdir(actFolderDir)
					.then((files) => files.length > 0)
					.catch(() => false));

			if (folderExists?.isDirectory() && folderHasFiles) {
				const message =
					`Cannot create new Actor, directory '${actorName}' already exists. Provide a different name.` +
					' To create a local Actor environment inside an existing directory, use "apify init".';

				if (json) {
					throw new Error(message);
				}

				error({ message });

				actorName = await ensureValidActorName();
				actFolderDir = join(cwd, actorName);

				continue;
			}

			// Create Actor directory structure
			if (!folderExists) {
				await mkdir(actFolderDir, { recursive: true });
			}
			break;
		}

		let messages = null;
		let templateId: string | null = null;

		this.telemetryData.create = {
			fromArchiveUrl: !!templateArchiveUrl,
			origin,
		};

		if (!templateArchiveUrl) {
			const templateDefinition = await getTemplateDefinition(templateName, manifestPromise, { useCase, language });
			({ archiveUrl: templateArchiveUrl, messages } = templateDefinition);
			templateId = templateDefinition.id;
			this.telemetryData.create.templateId = templateDefinition.id;
			this.telemetryData.create.templateName = templateDefinition.name;
			this.telemetryData.create.templateLanguage = templateDefinition.category;

			// This "exists"
			if ('skipOptionalDeps' in templateDefinition) {
				skipOptionalDeps = templateDefinition.skipOptionalDeps as boolean;
			}
		}

		// Set this _after_ the template is resolved, so that the flag takes precedence
		if (this.flags.omitOptionalDeps) {
			skipOptionalDeps = true;
		}

		await downloadAndUnzip({ url: templateArchiveUrl, pathTo: actFolderDir });

		// There may be .actor/actor.json file in used template - let's try to load it and change the name prop value to actorName
		const localConfig = getJsonFileContent(join(actFolderDir, LOCAL_CONFIG_PATH));
		await setLocalConfig(Object.assign(localConfig || EMPTY_LOCAL_CONFIG, { name: actorName }), actFolderDir);
		await setLocalEnv(actFolderDir);

		// Create prefilled INPUT.json file from the input schema prefills
		await createPrefilledInputFileFromInputSchema(actFolderDir);

		const packageJsonPath = join(actFolderDir, 'package.json');
		const readmePath = join(actFolderDir, 'README.md');

		// Add localReadmeSuffix which is fetched from manifest to README.md
		// The suffix contains local development instructions
		await enhanceReadmeWithLocalSuffix(readmePath, manifestPromise);

		let dependenciesInstalled = false;
		if (!skipDependencyInstall) {
			const cwdProjectResult = await useCwdProject({ cwd: actFolderDir });

			await cwdProjectResult.inspectAsync(async (project) => {
				const minimumSupportedNodeVersion = minVersion(SUPPORTED_NODEJS_VERSION);

				// uv-managed Python projects (recognized by a committed `uv.lock`) manage their own virtual
				// environment, dependencies, and Python version. Install them with `uv sync` instead of the
				// pip + requirements.txt flow. uv provides the Python pinned in `.python-version` on its own,
				// so this runs even when no system Python is detected.
				const isPythonProject = project.type === ProjectLanguage.Python || project.type === ProjectLanguage.Scrapy;

				if (isPythonProject && project.packageManager === 'uv') {
					const uvPath = await which('uv', { nothrow: true });

					if (!uvPath) {
						warning({
							message:
								'This Actor uses uv to manage its dependencies, but the uv executable was not found. ' +
								'Install uv (https://docs.astral.sh/uv/getting-started/installation/), then run "uv sync" in the Actor directory.',
						});
						return;
					}

					info({ message: 'Installing dependencies with "uv sync"...' });

					await execWithLog({
						cmd: uvPath,
						args: ['sync'],
						opts: { cwd: actFolderDir },
					});

					dependenciesInstalled = true;
					return;
				}

				if (!project.runtime) {
					switch (project.type) {
						case ProjectLanguage.JavaScript: {
							warning({
								message:
									`No Node.js detected! Please install Node.js ${minimumSupportedNodeVersion} or higher` +
									' to be able to run Node.js Actors locally.',
							});
							break;
						}
						case ProjectLanguage.Scrapy:
						case ProjectLanguage.Python: {
							warning({
								message: `No Python detected! Please install Python ${MINIMUM_SUPPORTED_PYTHON_VERSION} or higher to be able to run Python Actors locally.`,
							});
							break;
						}
						default:
						// Do nothing
					}
					return;
				}

				let { runtime } = project;

				switch (project.type) {
					case ProjectLanguage.JavaScript: {
						if (!isNodeVersionSupported(runtime.version)) {
							warning({
								message:
									`You are running Node.js version ${runtime.version}, which is no longer supported. ` +
									`Please upgrade to Node.js version ${minimumSupportedNodeVersion} or later.`,
							});
						}

						// If the Actor is a Node.js Actor (has package.json), run `npm install`
						await updateLocalJson(packageJsonPath, { name: actorName });

						// Run npm install in Actor dir.
						// For efficiency, don't install Puppeteer for templates that don't use it
						const cmdArgs = ['install'];

						// Force devDependencies to be installed even if the caller's
						// NODE_ENV is "production" or they've configured npm to omit dev deps.
						// Scaffolded projects rely on devDependencies (tsx, typescript, etc.)
						// to be runnable via `apify run` immediately after `apify create`.
						switch (runtime.pmName) {
							case 'npm': {
								if (gte(runtime.pmVersion!, '7.0.0')) {
									cmdArgs.push('--include=dev');
								} else {
									cmdArgs.push('--no-production');
								}
								break;
							}
							case 'bun': {
								// bun install skips devDependencies only when --production is passed;
								// nothing to force by default, but we still override NODE_ENV below.
								break;
							}
							default:
							// pnpm / yarn / deno respect NODE_ENV; overriding it below is enough.
						}

						if (skipOptionalDeps) {
							switch (runtime.pmName) {
								case 'npm': {
									if (gte(runtime.pmVersion!, '7.0.0')) {
										cmdArgs.push('--omit=optional');
									} else {
										cmdArgs.push('--no-optional');
									}
									break;
								}
								case 'bun': {
									cmdArgs.push('--omit=optional');
									break;
								}
								case 'deno': {
									// We want to make deno use the node_modules dir
									cmdArgs.push('--node-modules-dir');
									break;
								}
								default:
								// Do nothing
							}
						}

						// Override NODE_ENV so package managers that key devDependency
						// installation off it (pnpm, yarn, bun, npm) still install
						// devDependencies even when the parent shell has
						// NODE_ENV=production set (common in Dockerfiles, CI, and shells
						// that persist env from previous `apify push` invocations).
						const installEnv = { ...process.env, NODE_ENV: 'development' };

						await execWithLog({
							cmd: runtime.pmPath!,
							args: cmdArgs,
							opts: { cwd: actFolderDir, env: installEnv },
							overrideCommand: runtime.pmName,
						});

						dependenciesInstalled = true;

						break;
					}
					case ProjectLanguage.Python:
					case ProjectLanguage.Scrapy: {
						if (!isPythonVersionSupported(runtime.version)) {
							warning({
								message: `Python Actors require Python ${MINIMUM_SUPPORTED_PYTHON_VERSION} or higher, but you have Python ${runtime.version}!`,
							});
							warning({
								message: `Please install Python ${MINIMUM_SUPPORTED_PYTHON_VERSION} or higher to be able to run Python Actors locally.`,
							});
							return;
						}

						const venvPath = join(actFolderDir, '.venv');
						info({ message: `Python version ${runtime.version} detected.` });
						info({
							message: `Creating a virtual environment in "${venvPath}" and installing dependencies from "requirements.txt"...`,
						});

						if (!process.env.VIRTUAL_ENV) {
							// If Python is not running in a virtual environment, create a new one
							await execWithLog({
								cmd: runtime.executablePath,
								args: ['-m', 'venv', '--prompt', '.', PYTHON_VENV_PATH],
								opts: { cwd: actFolderDir },
							});

							// regenerate the `pythonCommand` after we create the virtual environment
							runtime = (await usePythonRuntime({ cwd: actFolderDir, force: true })).unwrap();
							project.runtime = runtime;
						}

						await execWithLog({
							cmd: runtime.executablePath,
							args: [
								'-m',
								'pip',
								'install',
								'--no-cache-dir',
								'--no-warn-script-location',
								'--upgrade',
								'pip',
								'setuptools',
								'wheel',
							],
							opts: { cwd: actFolderDir },
						});

						await execWithLog({
							cmd: runtime.executablePath,
							args: ['-m', 'pip', 'install', '--no-cache-dir', '--no-warn-script-location', '-r', 'requirements.txt'],
							opts: { cwd: actFolderDir },
						});

						dependenciesInstalled = true;

						break;
					}
					default:
					// Do nothing
				}
			});
		}

		// Initialize git repository before reporting success, but store result for later
		let gitInitResult: { success: boolean; error?: Error } = { success: true };
		const cwdHasGit = await stat(join(cwd, '.git')).catch(() => null);
		const gitInitAttempted = !skipGitInit && !cwdHasGit;

		if (gitInitAttempted) {
			try {
				// Use -b main so newly scaffolded projects start on `main` regardless
				// of the host's `init.defaultBranch` git config. Fall back to plain
				// `git init` for older git versions that don't support -b.
				try {
					await execWithLog({
						cmd: 'git',
						args: ['init', '-b', 'main'],
						opts: { cwd: actFolderDir },
					});
				} catch {
					await execWithLog({
						cmd: 'git',
						args: ['init'],
						opts: { cwd: actFolderDir },
					});
				}
			} catch (err) {
				gitInitResult = { success: false, error: err as Error };
			}
		}

		// Suggest install command if dependencies were not installed
		const installCommandSuggestion = !dependenciesInstalled ? await getInstallCommandSuggestion(actFolderDir) : null;

		const gitRepositoryInitialized = gitInitAttempted && gitInitResult.success;

		if (json) {
			printJsonToStdout({
				dir: actFolderDir,
				actorJsonPath: join(actFolderDir, LOCAL_CONFIG_PATH),
				template: templateId,
				source: 'apify',
				nextSteps: buildNextSteps({ actorName, dependenciesInstalled, installCommandSuggestion }),
				// Some templates need extra setup (e.g. "playwright install") before "apify run" works.
				postCreate: messages?.postCreate ?? null,
				gitRepositoryInitialized,
			});
		} else {
			simpleLog({ message: '' });
			success({
				message: formatCreateSuccessMessage({
					actorName,
					dependenciesInstalled,
					postCreate: messages?.postCreate ?? null,
					gitRepositoryInitialized,
					installCommandSuggestion,
				}),
			});
		}

		if (gitInitAttempted && !gitInitResult.success) {
			// Git init is not critical, so we just warn if it fails
			warning({ message: `Failed to initialize git repository: ${gitInitResult.error!.message}` });
			warning({ message: 'You can manually run "git init" in the Actor directory if needed.' });
		}
	}
}
