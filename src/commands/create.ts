import { mkdir, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

import { isCI } from 'ci-info';
import { gte, minVersion } from 'semver';
import which from 'which';

import { fetchManifest, manifestUrl } from '@apify/actor-templates';

import { ApifyCommand } from '../lib/command-framework/apify-command.js';
import { Args } from '../lib/command-framework/args.js';
import { Flags, YesFlag } from '../lib/command-framework/flags.js';
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
import {
	buildGitSourceNextSteps,
	getGitStopUrl,
	GIT_SOURCE_CHOICES,
	type GitSource,
	type GitSourceResult,
	isGitProvider,
	parseGitRepoFlag,
	promptGitSource,
	logGitSourceOutcome,
	runGitSourceFlow,
} from '../lib/git-source/gitSource.js';
import { usePythonRuntime } from '../lib/hooks/runtimes/python.js';
import { getInstallCommandSuggestion } from '../lib/hooks/runtimes/utils.js';
import { ProjectLanguage, useCwdProject } from '../lib/hooks/useCwdProject.js';
import { useStdin } from '../lib/hooks/useStdin.js';
import { createPrefilledInputFileFromInputSchema } from '../lib/input_schema.js';
import { error, info, simpleLog, success, warning } from '../lib/outputs.js';
import { LANGUAGE_FLAG_CHOICES, USE_CASE_FLAG_CHOICES } from '../lib/templates/consts.js';
import {
	downloadAndUnzip,
	getJsonFileContent,
	getLoggedClientOrThrow,
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
		'Prompts for an Actor name, then guides you through what you want to build, a language, a template, and where the source code lives when they are not provided. To run non-interactively, pass the name, --template and --source, or pass --yes to take the defaults. Use --use-case and --language to narrow the template list.';

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
		source: Flags.string({
			description:
				'Where the Actor source code will live. With "github", Apify creates the repository on your connected GitHub account from the template, clones it here, and creates an Actor that builds from it.',
			choices: [...GIT_SOURCE_CHOICES],
			// No default: an omitted flag triggers the wizard prompt, or "apify" when it cannot be asked.
			required: false,
		}),
		'git-repo': Flags.string({
			description:
				'Repository to create, as "workspace/name" — a workspace being an account or organization you have given Apify access to. A bare value is read as the name, not the workspace. The name defaults to the Actor name, and the workspace is asked for when you have more than one. List yours with "apify api integrations/git". Only used when --source is a Git provider.',
			required: false,
		}),
		...YesFlag(
			'Run without prompts. Pass the Actor name and --template, which have no default; everything else takes its default.',
		),
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
		const {
			template: templateName,
			useCase,
			language,
			skipDependencyInstall,
			skipGitInit,
			origin,
			json,
			gitRepo,
			yes,
		} = this.flags;

		// --template-archive-url is an internal, undocumented flag that's used
		// for testing of templates that are not yet published in the manifest
		let { templateArchiveUrl } = this.flags;
		let skipOptionalDeps = false;

		// Both flags mean "do not ask". The name and the template have no default, so reject a run missing
		// either before any directory is created.
		const nonInteractive = json || yes;
		const nonInteractiveFlag = json ? '--json' : '--yes';

		if (nonInteractive && !actorName) {
			throw new Error(`${nonInteractiveFlag} runs non-interactively. Pass the Actor name as an argument.`);
		}

		if (nonInteractive && !templateName && !templateArchiveUrl) {
			throw new Error(
				`${nonInteractiveFlag} runs non-interactively. Pass --template <name>; run \`apify templates ls\` to list values.`,
			);
		}

		let source = this.flags.source as GitSource | undefined;

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

				if (nonInteractive) {
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

		// The prompt helpers cannot be relied on for this: `useStdin` marks any non-TTY stdin as having
		// data, so their own non-interactive fallback only fires under CI.
		const { isTTY } = await useStdin();
		const isInteractive = isTTY && !isCI && !nonInteractive;

		// Last wizard step, matching the Console. A run that cannot be asked keeps the previous behaviour.
		source ??= isInteractive ? await promptGitSource() : 'apify';
		const gitProvider = isGitProvider(source) ? source : null;
		this.telemetryData.create.source = source;

		// Validate before anything downloads a template or asks for a token, so a bad flag combination
		// costs no more than the empty directory made above.
		if (gitProvider && skipGitInit) {
			throw new Error(`--source ${source} clones a git repository, so --skip-git-init cannot apply.`);
		}

		// Catches a non-interactive run that named a repository but omitted --source, which would
		// otherwise silently take the Apify path.
		if (!gitProvider && gitRepo) {
			throw new Error('--git-repo only applies to a Git source, so add --source github or drop it.');
		}

		// The platform only accepts archive URLs listed in the official manifest.
		if (gitProvider && this.flags.templateArchiveUrl) {
			throw new Error(`--template-archive-url is not supported with --source ${source}.`);
		}

		const gitSetup = gitProvider
			? {
					provider: gitProvider,
					client: await getLoggedClientOrThrow(),
					...parseGitRepoFlag(gitRepo, actorName),
				}
			: null;

		// Local-only setup, applied to the unzipped archive or to the clone, whichever the run produced.
		const applyLocalConfig = async (dir: string) => {
			// There may be .actor/actor.json file in used template - let's try to load it and change the name prop value to actorName
			const localConfig = getJsonFileContent(join(dir, LOCAL_CONFIG_PATH));
			await setLocalConfig(Object.assign(localConfig || EMPTY_LOCAL_CONFIG, { name: actorName }), dir);
			await setLocalEnv(dir);

			// Create prefilled INPUT.json file from the input schema prefills
			await createPrefilledInputFileFromInputSchema(dir);
		};

		if (!gitProvider) {
			await downloadAndUnzip({ url: templateArchiveUrl, pathTo: actFolderDir });
			await applyLocalConfig(actFolderDir);

			// Add localReadmeSuffix which is fetched from manifest to README.md
			// The suffix contains local development instructions. The Git path skips it: the platform
			// already appended its own while seeding the repository.
			await enhanceReadmeWithLocalSuffix(join(actFolderDir, 'README.md'), manifestPromise);
		}

		const packageJsonPath = join(actFolderDir, 'package.json');

		// Replaces the unzip above: the platform seeds the repository and the CLI clones it. Never throws.
		let gitResult: GitSourceResult | null = null;
		if (gitSetup) {
			gitResult = await runGitSourceFlow({
				provider: gitSetup.provider,
				actorDir: actFolderDir,
				actorName,
				workspace: gitSetup.workspace,
				repoName: gitSetup.repoName,
				// No way to ask for a public one yet; a visibility flag is coming to Console and the CLI together.
				isPrivate: true,
				templateArchiveUrl,
				client: gitSetup.client,
				isInteractive,
				customize: applyLocalConfig,
			});
		}

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

						await execWithLog({
							cmd: runtime.pmPath!,
							args: cmdArgs,
							opts: { cwd: actFolderDir },
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
		// Skip when the Actor directory is already a repository, which the Git path's clone has made it.
		const actorDirHasGit = await stat(join(actFolderDir, '.git')).catch(() => null);
		const stoppedEmpty = gitResult !== null && !gitResult.scaffolded;
		const gitInitAttempted = !skipGitInit && !cwdHasGit && !actorDirHasGit && !stoppedEmpty;

		if (gitInitAttempted) {
			try {
				await execWithLog({
					cmd: 'git',
					args: ['init'],
					opts: { cwd: actFolderDir },
				});
			} catch (err) {
				gitInitResult = { success: false, error: err as Error };
			}
		}

		// Suggest install command if dependencies were not installed
		const installCommandSuggestion = !dependenciesInstalled ? await getInstallCommandSuggestion(actFolderDir) : null;

		const gitRepositoryInitialized = gitInitAttempted && gitInitResult.success;

		// Any stop leaves the Actor unwired, so the command fails. `--json` callers read `stopReason`, but
		// a shell script sees only $?.
		if (gitResult?.stopReason) process.exitCode = 1;

		// A stop has its own recovery steps; anything else uses the normal ones, since the user may still
		// need to install dependencies.
		const gitNextSteps =
			gitSetup && gitResult?.stopReason
				? buildGitSourceNextSteps({
						actorName,
						stopReason: gitResult.stopReason,
						provider: gitSetup.provider,
						remoteUrl: gitResult.remoteUrl,
						httpsUrl: gitResult.httpsUrl,
						repoName: gitSetup.repoName,
						scaffolded: gitResult.scaffolded,
					})
				: buildNextSteps({ actorName, dependenciesInstalled, installCommandSuggestion });

		const reportSuccess = !gitResult?.stopReason;

		if (json) {
			printJsonToStdout({
				dir: actFolderDir,
				actorJsonPath: join(actFolderDir, LOCAL_CONFIG_PATH),
				template: templateId,
				source,
				nextSteps: gitNextSteps,
				// Some templates need extra setup (e.g. "playwright install") before "apify run" works.
				postCreate: messages?.postCreate ?? null,
				gitRepositoryInitialized,
				remote: gitResult?.remoteUrl ?? null,
				actorId: gitResult?.actorId ?? null,
				stopReason: gitResult?.stopReason ?? null,
				error: gitResult?.error ?? null,
				gitConnectUrl: gitProvider ? getGitStopUrl(gitProvider, gitResult?.stopReason ?? null) : null,
				workspaces: gitResult?.workspaces ?? null,
			});
		} else if (reportSuccess) {
			simpleLog({ message: '' });
			success({
				message: formatCreateSuccessMessage({
					actorName,
					dependenciesInstalled,
					postCreate: messages?.postCreate ?? null,
					gitRepositoryInitialized,
					installCommandSuggestion,
					gitRemote:
						gitResult?.remoteUrl && gitResult.actorId
							? { remoteUrl: gitResult.remoteUrl, actorId: gitResult.actorId }
							: null,
				}),
			});
		}

		if (gitInitAttempted && !gitInitResult.success) {
			// Git init is not critical, so we just warn if it fails
			warning({ message: `Failed to initialize git repository: ${gitInitResult.error!.message}` });
			warning({ message: 'You can manually run "git init" in the Actor directory if needed.' });
		}

		if (gitResult && !json) logGitSourceOutcome(gitResult, gitNextSteps);
	}
}
