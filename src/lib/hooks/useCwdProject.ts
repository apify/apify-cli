import { access, readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import process from 'node:process';

import { err, ok, type Result } from '@sapphire/result';

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
	warnings?: string[];
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
				try {
					const pythonFile = await checkPythonProject(cwd);

					if (pythonFile) {
						project.entrypoint = {
							path: pythonFile,
						};
					}
				} catch {
					// If we can't find the Python entrypoint, that's okay for Scrapy projects
					// Just continue without setting the entrypoint
				}
			}

			return;
		}

		// Check for Node.js first. If a package.json exists (even without a start script),
		// the project is treated as JavaScript. This is intentional: package.json is a strong
		// signal of a Node.js project, and Python projects typically don't have one.
		// If both package.json and a Python package exist, JavaScript wins.
		const isNode = await checkNodeProject(cwd);

		if (!isNode) {
			// No Node.js project found, check for Python
			let isPython: string | null = null;
			try {
				isPython = await checkPythonProject(cwd);
			} catch (error) {
				// If checkPythonProject throws an error, it means it detected Python but
				// couldn't determine the entrypoint. We should propagate this error.
				return err({
					message: error instanceof Error ? error.message : String(error),
				});
			}

			if (isPython) {
				project.type = ProjectLanguage.Python;

				const runtime = await usePythonRuntime({ cwd });

				project.entrypoint = {
					path: isPython,
				};

				project.runtime = runtime.unwrapOr(undefined);

				// Check if the detected package has __main__.py (required for `python -m <package>`)
				const packageDir = join(cwd, isPython.replace(/\./g, '/'));
				const hasMainPy = await fileExists(join(packageDir, '__main__.py'));

				if (!hasMainPy) {
					project.warnings = [
						`The detected Python package "${isPython}" is missing __main__.py. ` +
							'Running with "python -m" will fail without it.',
					];
				}

				return;
			}
		}

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

// Helper functions for Python project detection

async function fileExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

async function dirExists(path: string): Promise<boolean> {
	try {
		const s = await stat(path);
		return s.isDirectory();
	} catch {
		return false;
	}
}

function isValidPythonIdentifier(name: string): boolean {
	// Must start with letter or underscore, contain only alphanumerics and underscores
	return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

async function hasPythonFilesInDirOrSubdirs(cwd: string): Promise<boolean> {
	try {
		const entries = await readdir(cwd, { withFileTypes: true });

		// Check for .py files directly in cwd
		if (entries.some((entry) => entry.isFile() && entry.name.endsWith('.py'))) {
			return true;
		}

		// Check for .py files in immediate subdirectories (e.g. my_package/main.py)
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;

			const subDir = join(cwd, entry.name);

			try {
				const subEntries = await readdir(subDir, { withFileTypes: true });
				if (subEntries.some((sub) => sub.isFile() && sub.name.endsWith('.py'))) {
					return true;
				}

				// For src/ container, also check one level deeper (e.g. src/my_package/main.py)
				if (entry.name === 'src') {
					for (const srcEntry of subEntries) {
						if (!srcEntry.isDirectory()) continue;
						if (srcEntry.name.startsWith('.') || srcEntry.name.startsWith('_')) continue;

						try {
							const srcSubEntries = await readdir(join(subDir, srcEntry.name), { withFileTypes: true });
							if (srcSubEntries.some((sub) => sub.isFile() && sub.name.endsWith('.py'))) {
								return true;
							}
						} catch {
							// Ignore unreadable subdirectories
						}
					}
				}
			} catch {
				// Ignore unreadable subdirectories
			}
		}

		return false;
	} catch {
		return false;
	}
}

interface NearMissPackage {
	name: string;
	needsRename: boolean;
	needsInit: boolean;
}

async function dirHasPyFiles(dir: string): Promise<boolean> {
	try {
		const entries = await readdir(dir, { withFileTypes: true });
		return entries.some((entry) => entry.isFile() && entry.name.endsWith('.py') && entry.name !== '__init__.py');
	} catch {
		return false;
	}
}

async function findNearMissPackagesInDir(dir: string): Promise<NearMissPackage[]> {
	try {
		const entries = await readdir(dir, { withFileTypes: true });
		const nearMisses: NearMissPackage[] = [];

		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;

			const validName = isValidPythonIdentifier(entry.name);
			const hasInit = await fileExists(join(dir, entry.name, '__init__.py'));
			const hasPy = hasInit || (await dirHasPyFiles(join(dir, entry.name)));

			// Skip if already a valid package (valid name + __init__.py) — not a near-miss
			if (validName && hasInit) continue;

			// Skip if no Python indicators at all — not a near-miss
			if (!hasPy) continue;

			nearMisses.push({
				name: entry.name,
				needsRename: !validName,
				needsInit: !hasInit,
			});
		}

		return nearMisses;
	} catch {
		return [];
	}
}

async function findPackagesInDir(dir: string): Promise<{ name: string; path: string }[]> {
	try {
		const entries = await readdir(dir, { withFileTypes: true });
		const packages = [];

		for (const entry of entries) {
			if (!entry.isDirectory()) continue;

			const { name } = entry;

			// Skip hidden directories (starting with .) and underscore-prefixed directories
			// (private/special packages like _internal or __pycache__ shouldn't be main entrypoints)
			if (name.startsWith('.') || name.startsWith('_')) continue;
			if (!isValidPythonIdentifier(name)) continue;

			// Check for __init__.py
			const initPath = join(dir, name, '__init__.py');
			if (await fileExists(initPath)) {
				packages.push({ name, path: join(dir, name) });
			}
		}

		return packages;
	} catch {
		return [];
	}
}

async function discoverPythonPackages(cwd: string): Promise<string[]> {
	const packages: string[] = [];

	// Search level 1 (CWD)
	const level1Packages = await findPackagesInDir(cwd);
	packages.push(...level1Packages.map((p) => p.name));

	// Search level 2 (src/) - only if src/ is NOT itself a package
	// If src/ has __init__.py, it's a package and anything inside is a subpackage, not a top-level package
	const srcDir = join(cwd, 'src');
	const srcIsPackage = await fileExists(join(srcDir, '__init__.py'));

	if ((await dirExists(srcDir)) && !srcIsPackage) {
		const level2Packages = await findPackagesInDir(srcDir);
		packages.push(...level2Packages.map((p) => `src.${p.name}`));
	}

	return packages;
}

async function checkPythonProject(cwd: string): Promise<string | null> {
	const discoveredPackages = await discoverPythonPackages(cwd);

	if (discoveredPackages.length === 1) {
		return discoveredPackages[0];
	}

	if (discoveredPackages.length > 1) {
		const packageList = discoveredPackages.map((pkg) => `  - ${pkg}`).join('\n');
		throw new Error(
			`Multiple Python packages found:\n${packageList}\n\n` +
				'Apify CLI cannot determine which package to run.\n' +
				'Please ensure only one top-level package exists in your project.',
		);
	}

	// No packages found — check for near-miss packages
	const nearMissAtRoot = await findNearMissPackagesInDir(cwd);
	const srcDir = join(cwd, 'src');
	const srcIsPackage = await fileExists(join(srcDir, '__init__.py'));
	const nearMissInSrc = !srcIsPackage && (await dirExists(srcDir)) ? await findNearMissPackagesInDir(srcDir) : [];

	const allNearMisses = [
		...nearMissAtRoot.map((nm) => ({ ...nm, prefix: '' })),
		...nearMissInSrc.map((nm) => ({ ...nm, prefix: 'src/' })),
	];

	if (allNearMisses.length > 0) {
		const suggestions = allNearMisses
			.map(({ name, prefix, needsRename, needsInit }) => {
				const fixes: string[] = [];
				if (needsRename) fixes.push(`rename to "${prefix}${name.replace(/[^a-zA-Z0-9_]/g, '_')}/"`);
				if (needsInit) fixes.push('add __init__.py');
				return `  - "${prefix}${name}/" → ${fixes.join(' and ')}`;
			})
			.join('\n');

		throw new Error(
			`Found directories that appear to be Python packages but have issues:\n${suggestions}\n\n` +
				'A valid Python package requires a directory with a valid identifier name ' +
				'(letters, numbers, underscores) and an __init__.py file.',
		);
	}

	// Check if there are loose .py files (broken Python project)
	const hasPyFiles = await hasPythonFilesInDirOrSubdirs(cwd);
	if (hasPyFiles) {
		throw new Error(
			'No Python package found. Found Python files, but no valid package structure detected.\n' +
				'A Python package requires:\n' +
				'  - A directory with a valid Python identifier name (letters, numbers, underscores)\n' +
				'  - An __init__.py file inside the directory\n' +
				'\n' +
				'Common package structures:\n' +
				'  my_package/\n' +
				'    __init__.py\n' +
				'    main.py\n' +
				'\n' +
				'  src/\n' +
				'    my_package/\n' +
				'      __init__.py\n' +
				'      main.py',
		);
	}

	return null; // Not a Python project
}

async function checkScrapyProject(cwd: string) {
	// TODO: maybe rewrite this to a newer format 🤷
	return ScrapyProjectAnalyzer.isApplicable(cwd);
}
