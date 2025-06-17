import { access, readFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import process from 'node:process';

import { ok, type Result } from '@sapphire/result';

import { ScrapyProjectAnalyzer } from '../projects/scrapy/ScrapyProjectAnalyzer.js';
import { cliDebugPrint } from '../utils/cliDebugPrint.js';
import { useJavaScriptRuntime } from './runtimes/javascript.js';
import { usePythonRuntime } from './runtimes/python.js';

export enum ProjectLanguage {
	JavaScript = 0,
	Python = 1,
	// Special handling for Scrapy projects
	Scrapy = 2,
	Unknown = 3,
	// TODO: eventually when we support entrypoint config in actor json
	// https://github.com/apify/apify-cli/issues/766
	StaticEntrypoint = 4,
}

export interface Runtime {
	executablePath: string;
	version: string;
	pmName?: string;
	pmPath?: string | null;
	pmVersion?: string | null;
	runtimeShorthand?: string;
}

export interface Entrypoint {
	path?: string;
	script?: string;
}

export interface CwdProject {
	type: ProjectLanguage;
	entrypoint?: Entrypoint;
	runtime?: Runtime;
}

export interface CwdProjectError {
	message: string;
}

export const cwdCache = new Map<string, CwdProject>();

export async function useCwdProject({
	cwd = process.cwd(),
}: {
	cwd?: string;
} = {}): Promise<Result<CwdProject, CwdProjectError>> {
	const cached = cwdCache.get(cwd);

	if (cached) {
		cliDebugPrint('useCwdProject', { cacheHit: true, project: cached });
		return ok(cached);
	}

	const project: CwdProject = {
		type: ProjectLanguage.Unknown,
	};

	const check = async (): Promise<Result<CwdProject, CwdProjectError> | undefined> => {
		const isScrapy = await checkScrapyProject(cwd);

		if (isScrapy) {
			project.type = ProjectLanguage.Scrapy;

			const runtime = await usePythonRuntime({ cwd });

			project.runtime = runtime.unwrapOr(undefined);

			const scrapyProject = new ScrapyProjectAnalyzer(cwd);
			scrapyProject.loadScrapyCfg();

			if (scrapyProject.configuration.hasKey('apify', 'mainpy_location')) {
				project.entrypoint = {
					path: scrapyProject.configuration.get('apify', 'mainpy_location')!,
				};
			} else {
				// Fallback for scrapy projects that use apify, but are not "migrated" (like our templates)
				const pythonFile = await checkPythonProject(cwd);

				if (pythonFile) {
					project.entrypoint = {
						path: pythonFile,
					};
				}
			}

			return;
		}

		const isPython = await checkPythonProject(cwd);

		if (isPython) {
			project.type = ProjectLanguage.Python;

			const runtime = await usePythonRuntime({ cwd });

			project.entrypoint = {
				path: isPython,
			};

			project.runtime = runtime.unwrapOr(undefined);

			return;
		}

		const isNode = await checkNodeProject(cwd);

		if (isNode) {
			project.type = ProjectLanguage.JavaScript;

			const runtime = await useJavaScriptRuntime();

			project.runtime = runtime.unwrapOr(undefined);

			if (isNode.type === 'file') {
				project.entrypoint = {
					path: isNode.path,
				};
			} else if (isNode.type === 'script') {
				project.entrypoint = {
					script: isNode.script,
				};
			}

			return;
		}

		return ok(project);
	};

	const maybeErr = await check();

	if (maybeErr?.isErr()) {
		cliDebugPrint('useCwdProject', { cacheHit: false, error: maybeErr });
		return maybeErr;
	}

	cliDebugPrint('useCwdProject', { cacheHit: false, project });
	cwdCache.set(cwd, project);

	return ok(project);
}

async function checkNodeProject(cwd: string) {
	const packageJsonPath = join(cwd, 'package.json');

	try {
		const rawString = await readFile(packageJsonPath, 'utf-8');

		const pkg = JSON.parse(rawString);

		// Always prefer start script if it exists
		if (pkg.scripts?.start) {
			return { type: 'script', script: 'start' } as const;
		}

		// Try to find the main entrypoint if it exists (if its a TypeScript file, the user has to deal with ensuring their runtime can run it directly)
		if (pkg.main) {
			try {
				await access(resolve(cwd, pkg.main));

				return { path: resolve(cwd, pkg.main), type: 'file' } as const;
			} catch {
				// Ignore errors
			}
		}

		// We have a node project but we don't know what to do with it
		return { type: 'unknown-entrypoint' } as const;
	} catch {
		// Ignore missing package.json and try some common files
	}

	const filesToCheck = [
		join(cwd, 'index.js'),
		join(cwd, 'index.mjs'),
		join(cwd, 'index.cjs'),
		join(cwd, 'main.js'),
		join(cwd, 'main.mjs'),
		join(cwd, 'main.cjs'),
		join(cwd, 'src', 'index.js'),
		join(cwd, 'src', 'index.mjs'),
		join(cwd, 'src', 'index.cjs'),
		join(cwd, 'src', 'main.js'),
		join(cwd, 'src', 'main.mjs'),
		join(cwd, 'src', 'main.cjs'),
		join(cwd, 'dist', 'index.js'),
		join(cwd, 'dist', 'index.mjs'),
		join(cwd, 'dist', 'index.cjs'),
		join(cwd, 'dist', 'main.js'),
		join(cwd, 'dist', 'main.mjs'),
		join(cwd, 'dist', 'main.cjs'),
	];

	for (const path of filesToCheck) {
		try {
			await access(path);
			return { path, type: 'file' } as const;
		} catch {
			// Ignore errors
		}
	}

	return null;
}

async function checkPythonProject(cwd: string) {
	const baseName = basename(cwd);

	const filesToCheck = [
		join(cwd, 'src', '__main__.py'),
		join(cwd, '__main__.py'),
		join(cwd, baseName, '__main__.py'),
		join(cwd, baseName.replaceAll('-', '_').replaceAll(' ', '_'), '__main__.py'),
	];

	for (const path of filesToCheck) {
		try {
			await access(path);

			// By default in python, we run python3 -m <module>
			// For some unholy reason, python does NOT support absolute paths for this -.-
			// Effectively, this returns `src` from `/cwd/src/__main__.py`, et al.
			return basename(dirname(path));
		} catch {
			// Ignore errors
		}
	}

	return null;
}

async function checkScrapyProject(cwd: string) {
	// TODO: maybe rewrite this to a newer format 🤷
	return ScrapyProjectAnalyzer.isApplicable(cwd);
}
