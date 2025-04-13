import { access } from 'node:fs/promises';
import { platform } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

import { none, some, type Option } from '@sapphire/result';
import { execa } from 'execa';
import which from 'which';

import type { Runtime } from '../useCwdProject.js';

const cwdCache = new Map<string, Option<Runtime>>();

async function getPythonVersion(runtimePath: string) {
	try {
		const result = await execa(runtimePath, ['-c', '"import platform; print(platform.python_version())"'], {
			shell: true,
			windowsHide: true,
		});

		// No output -> issue or who knows
		if (!result.stdout) {
			return null;
		}

		return result.stdout.trim();
	} catch (ex) {
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

	try {
		await access(fullPythonVenvPath);

		const version = await getPythonVersion(fullPythonVenvPath);

		if (version) {
			cwdCache.set(
				cwd,
				some({
					executablePath: fullPythonVenvPath,
					version,
				}),
			);

			return some({
				executablePath: fullPythonVenvPath,
				version,
			});
		}
	} catch {
		// Ignore errors
	}

	const fallbacks = ['python3', 'python', ...(isWindows ? ['python3.exe', 'python.exe'] : [])];

	for (const fallback of fallbacks) {
		try {
			const fullPath = await which(fallback);

			const version = await getPythonVersion(fullPath);

			if (version) {
				cwdCache.set(
					cwd,
					some({
						executablePath: fullPath,
						version,
					}),
				);

				return some({
					executablePath: fullPath,
					version,
				});
			}
		} catch {
			// Continue
		}
	}

	cwdCache.set(cwd, none);

	return none;
}
