import { mkdir, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

import { fetchManifest, manifestUrl } from '@apify/actor-templates';
import { Args, Flags } from '@oclif/core';
import { gte, minVersion } from 'semver';

import { ApifyCommand } from '../lib/apify_command.js';
import { EMPTY_LOCAL_CONFIG, LOCAL_CONFIG_PATH, PYTHON_VENV_PATH, SUPPORTED_NODEJS_VERSION } from '../lib/consts.js';
import { enhanceReadmeWithLocalSuffix, ensureValidActorName, getTemplateDefinition } from '../lib/create-utils.js';
import { execWithLog } from '../lib/exec.js';
import { updateLocalJson } from '../lib/files.js';
import { usePythonRuntime } from '../lib/hooks/runtimes/python.js';
import { ProjectLanguage, useCwdProject } from '../lib/hooks/useCwdProject.js';
import { createPrefilledInputFileFromInputSchema } from '../lib/input_schema.js';
import { error, info, success, warning } from '../lib/outputs.js';
import {
	downloadAndUnzip,
	getJsonFileContent,
	isNodeVersionSupported,
	isPythonVersionSupported,
	setLocalConfig,
	setLocalEnv,
} from '../lib/utils.js';

export class CreateCommand extends ApifyCommand<typeof CreateCommand> {
	static override description = 'Creates an Actor project from a template in a new directory.';

	static override flags = {
		template: Flags.string({
			char: 't',
			description:
				'Template for the Actor. If not provided, the command will prompt for it.\n' +
				`Visit ${manifestUrl} to find available template names.`,
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
	};

	static override args = {
		actorName: Args.string({
			required: false,
			description: 'Name of the Actor and its directory',
		}),
	};

	async run() {
		let { actorName } = this.args;
		const { template: templateName, skipDependencyInstall } = this.flags;

		// --template-archive-url is an internal, undocumented flag that's used
		// for testing of templates that are not yet published in the manifest
		let { templateArchiveUrl } = this.flags;
		let skipOptionalDeps = false;

		// Start fetching manifest immediately to prevent
		// annoying delays that sometimes happen on CLI startup.
		const manifestPromise = fetchManifest().catch((err) => {
			return new Error(`Could not fetch template list from server. Cause: ${err?.message}`);
		});

		actorName = await ensureValidActorName(actorName);

		const cwd = process.cwd();
		let actFolderDir = join(cwd, actorName);

		// eslint-disable-next-line no-constant-condition
		while (true) {
			const folderExists = await stat(actFolderDir).catch(() => null);
			const folderHasFiles =
				folderExists &&
				(await readdir(actFolderDir)
					.then((files) => files.length > 0)
					.catch(() => false));

			if (folderExists?.isDirectory() && folderHasFiles) {
				error({
					message:
						`Cannot create new Actor, directory '${actorName}' already exists. Please provide a different name.` +
						' You can use "apify init" to create a local Actor environment inside an existing directory.',
				});

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

		this.telemetryData.fromArchiveUrl = !!templateArchiveUrl;

		if (!templateArchiveUrl) {
			const templateDefinition = await getTemplateDefinition(templateName, manifestPromise);
			({ archiveUrl: templateArchiveUrl, messages } = templateDefinition);
			this.telemetryData.templateId = templateDefinition.id;
			this.telemetryData.templateName = templateDefinition.name;
			this.telemetryData.templateLanguage = templateDefinition.category;

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

				if (!project.runtime) {
					switch (project.type) {
						case ProjectLanguage.JavaScript: {
							error({
								message:
									`No Node.js detected! Please install Node.js ${minimumSupportedNodeVersion} or higher` +
									' to be able to run Node.js Actors locally.',
							});
							break;
						}
						case ProjectLanguage.Scrapy:
						case ProjectLanguage.Python: {
							break;
						}
						default:
						// Do nothing
					}
					return;
				}

				// eslint-disable-next-line prefer-destructuring
				let runtime = project.runtime;

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
								message: `Python Actors require Python 3.9 or higher, but you have Python ${runtime.version}!`,
							});
							warning({
								message: 'Please install Python 3.9 or higher to be able to run Python Actors locally.',
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
							args: [
								'-m',
								'pip',
								'install',
								'--no-cache-dir',
								'--no-warn-script-location',
								'-r',
								'requirements.txt',
							],
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

		if (dependenciesInstalled) {
			success({ message: `Actor '${actorName}' was created. To run it, run "cd ${actorName}" and "apify run".` });
			info({ message: 'To run your code in the cloud, run "apify push" and deploy your code to Apify Console.' });
			if (messages?.postCreate) {
				info({ message: messages?.postCreate });
			}
		} else {
			success({
				message: `Actor '${actorName}' was created. Please install its dependencies to be able to run it using "apify run".`,
			});
		}
	}
}
