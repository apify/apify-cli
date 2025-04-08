import { none, some, type Option } from '@sapphire/result';
import { execa } from 'execa';
import which from 'which';

import type { Runtime } from '../useCwdProject.js';

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

export async function useJavaScriptRuntime(): Promise<
	Option<Runtime & { runtimeShorthand: keyof typeof runtimesToCheck }>
> {
	for (const [runtime, args] of Object.entries(runtimesToCheck) as [keyof typeof runtimesToCheck, string[]][]) {
		try {
			const runtimePath = await which(runtime);

			const version = await getRuntimeVersion(runtimePath, args);

			if (version) {
				const res: Runtime & { runtimeShorthand: keyof typeof runtimesToCheck } = {
					executablePath: runtimePath,
					version,
					runtimeShorthand: runtime,
				};

				// For npm, we also fetch the npm version
				if (runtime === 'node') {
					const npmPath = await which('npm').catch(() => null);

					if (npmPath) {
						res.pmVersion = await getNpmVersion(npmPath);
						res.pmPath = npmPath;
					}
				}

				return some(res);
			}
		} catch {
			// Ignore errors
		}
	}

	return none;
}
