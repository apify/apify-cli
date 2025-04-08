import { access, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import process from 'node:process';

import { err, ok, type Result } from '@sapphire/result';

import { useJavaScriptRuntime } from './runtimes/javascript.js';
import { usePythonRuntime } from './runtimes/python.js';
import { ScrapyProjectAnalyzer } from '../projects/scrapy/ScrapyProjectAnalyzer.js';

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
	pmPath?: string | null;
	pmVersion?: string | null;
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

export async function useCwdProject(cwd = process.cwd()): Promise<Result<CwdProject, CwdProjectError>> {
	const project: CwdProject = {
		type: ProjectLanguage.Unknown,
	};

	const check = async (): Promise<Result<CwdProject, CwdProjectError> | undefined> => {
		const isScrapy = await checkScrapyProject(cwd);

		if (isScrapy) {
			project.type = ProjectLanguage.Scrapy;
			return;
		}

		const isPython = await checkPythonProject(cwd);

		if (isPython) {
			project.type = ProjectLanguage.Python;

			const runtime = await usePythonRuntime(cwd);

			if (runtime.isNone()) {
				return err({
					message: 'Failed to detect Python runtime',
				});
			}

			project.entrypoint = {
				path: isPython,
			};

			project.runtime = runtime.unwrap();

			return;
		}

		const isNode = await checkNodeProject(cwd);

		if (isNode) {
			project.type = ProjectLanguage.JavaScript;

			const runtime = await useJavaScriptRuntime();

			if (runtime.isNone()) {
				return err({
					message: 'Failed to detect JavaScript runtime',
				});
			}

			project.runtime = runtime.unwrap();

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
		return maybeErr;
	}

	return ok(project);
}

async function checkNodeProject(cwd: string) {
	const packageJsonPath = join(cwd, 'package.json');

	try {
		const rawString = await readFile(packageJsonPath, 'utf-8');

		const pkg = JSON.parse(rawString);

		if (pkg.main) {
			return { path: join(cwd, pkg.main), type: 'file' } as const;
		}

		if (pkg.scripts?.start) {
			return { type: 'script', script: pkg.scripts.start } as const;
		}
	} catch {
		// Ignore missing package.json and try some common files
	}

	const filesToCheck = [
		join(cwd, 'index.js'),
		join(cwd, 'index.mjs'),
		join(cwd, 'index.cjs'),
		join(cwd, 'src', 'index.js'),
		join(cwd, 'src', 'index.mjs'),
		join(cwd, 'src', 'index.cjs'),
		join(cwd, 'dist', 'index.js'),
		join(cwd, 'dist', 'index.mjs'),
		join(cwd, 'dist', 'index.cjs'),
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
			return path;
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
