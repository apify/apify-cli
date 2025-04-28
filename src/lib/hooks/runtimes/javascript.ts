import process from 'node:process';

import { none, type Option, some } from '@sapphire/result';
import { execa } from 'execa';
import which from 'which';

import { cliDebugPrint } from '../../utils/cliDebugPrint.js';
import type { Runtime } from '../useCwdProject.js';
import { normalizeExecutablePath } from './utils.js';

const cwdCache = new Map<string, Option<Runtime>>();

// Runtimes, in order of preference
const runtimesToCheck = {
	node: ['--version'],
	deno: ['eval', '"console.log(process.versions.node)"'],
	bun: ['--eval', '"console.log(process.versions.node)"'],
};

async function getRuntimeVersion(runtimePath: string, args: string[]) {
	try {
		const result = await execa(runtimePath, args, {
			shell: true,
			windowsHide: true,
		});

		// No output -> issue or who knows
		if (!result.stdout) {
			return null;
		}

		return result.stdout.trim().replace(/^v/, '');
	} catch {
		return null;
	}
}

async function getNpmVersion(npmPath: string) {
	const result = await execa(npmPath, ['--version'], {
		shell: true,
		windowsHide: true,
	});

	if (!result.stdout) {
		return null;
	}

	return result.stdout.trim().replace(/^v/, '');
}

export async function useJavaScriptRuntime(cwd = process.cwd()): Promise<Option<Runtime>> {
	const cached = cwdCache.get(cwd);

	if (cached) {
		cliDebugPrint('useJavaScriptRuntime', { cacheHit: true, cwd, runtime: cached.unwrapOr(null) });
		return cached;
	}

	for (const [runtime, args] of Object.entries(runtimesToCheck) as [keyof typeof runtimesToCheck, string[]][]) {
		try {
			const runtimePath = normalizeExecutablePath(await which(runtime));

			const version = await getRuntimeVersion(runtimePath, args);

			if (version) {
				const res: Runtime = {
					executablePath: runtimePath,
					version,
				};

				// For npm, we also fetch the npm version
				if (runtime === 'node') {
					const npmPath = normalizeExecutablePath(await which('npm').catch(() => null));

					if (npmPath) {
						res.pmPath = npmPath;
						res.pmVersion = await getNpmVersion(npmPath);
						res.pmName = 'npm';
					}
				}
				// deno and bun support package.json scripts out of the box
				else {
					res.runtimeShorthand = runtime;
					res.pmPath = runtimePath;
					res.pmVersion = version;
					res.pmName = runtime;
				}

				cwdCache.set(cwd, some(res));

				cliDebugPrint('useJavaScriptRuntime', { cacheHit: false, cwd, runtime: cwdCache.get(cwd)?.unwrap() });

				return some(res);
			}
		} catch {
			// Ignore errors
		}
	}

	cwdCache.set(cwd, none);

	cliDebugPrint('useJavaScriptRuntime', { cacheHit: false, cwd, runtime: null });

	return none;
}
