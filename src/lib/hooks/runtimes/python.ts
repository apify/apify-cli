import { platform } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

import { none, type Option, some } from '@sapphire/result';
import { execa } from 'execa';
import which from 'which';

import { cliDebugPrint } from '../../utils/cliDebugPrint.js';
import type { Runtime } from '../useCwdProject.js';
import { normalizeExecutablePath } from './utils.js';

const cwdCache = new Map<string, Option<Runtime>>();

async function getPythonVersion(runtimePath: string) {
	try {
		const result = await execa(runtimePath, ['-c', '"import platform; print(platform.python_version())"'], {
			shell: true,
			windowsHide: true,
			verbose: process.env.APIFY_CLI_DEBUG ? 'full' : undefined,
		});

		// No output -> issue or who knows
		if (!result.stdout) {
			return null;
		}

		return result.stdout.trim();
	} catch {
		// const casted = ex as ExecaError;

		return null;
	}
}

export interface UsePythonRuntimeInput {
	cwd?: string;
	force?: boolean;
}

export async function usePythonRuntime({
	cwd = process.cwd(),
	force = false,
}: UsePythonRuntimeInput = {}): Promise<Option<Runtime>> {
	const cached = cwdCache.get(cwd);

	if (cached && !force) {
		cliDebugPrint('usePythonRuntime', { cacheHit: true, cwd, runtime: cached.unwrapOr(null) });
		return cached;
	}

	const isWindows = platform() === 'win32';

	const pathParts = isWindows ? ['Scripts', 'python.exe'] : ['bin', 'python3'];

	let fullPythonVenvPath;

	if (process.env.VIRTUAL_ENV) {
		fullPythonVenvPath = join(process.env.VIRTUAL_ENV, ...pathParts);
	} else {
		fullPythonVenvPath = join(cwd, '.venv', ...pathParts);
	}

	fullPythonVenvPath = normalizeExecutablePath(fullPythonVenvPath);

	try {
		const version = await getPythonVersion(fullPythonVenvPath);

		if (version) {
			cwdCache.set(
				cwd,
				some({
					executablePath: fullPythonVenvPath,
					version,
				}),
			);

			cliDebugPrint('usePythonRuntime', { cacheHit: false, cwd, runtime: cwdCache.get(cwd)?.unwrap() });

			return cwdCache.get(cwd)!;
		}
	} catch {
		// Ignore errors
	}

	const fallbacks = ['python3', 'python', ...(isWindows ? ['python3.exe', 'python.exe'] : [])];

	for (const fallback of fallbacks) {
		try {
			const fullPath = normalizeExecutablePath(await which(fallback));

			const version = await getPythonVersion(fullPath);

			if (version) {
				cwdCache.set(
					cwd,
					some({
						executablePath: fullPath,
						version,
					}),
				);

				cliDebugPrint('usePythonRuntime', { cacheHit: false, cwd, runtime: cwdCache.get(cwd)?.unwrap() });

				return cwdCache.get(cwd)!;
			}
		} catch {
			// Continue
		}
	}

	cwdCache.set(cwd, none);

	cliDebugPrint('usePythonRuntime', { cacheHit: false, cwd, runtime: null });

	return none;
}
