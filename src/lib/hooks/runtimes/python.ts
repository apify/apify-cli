import { access } from 'node:fs/promises';
import { platform } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

import { none, some, type Option } from '@sapphire/result';
import { execa } from 'execa';
import which from 'which';

import type { Runtime } from '../useCwdProject.js';

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

export async function usePythonRuntime(cwd = process.cwd()): Promise<Option<Runtime>> {
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
				return some({
					executablePath: fullPath,
					version,
				});
			}
		} catch {
			// Continue
		}
	}

	return none;
}
