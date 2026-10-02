import ciInfo from 'ci-info';

import { AGENT_ENV_VARS, isNonInteractive } from '../../nonInteractiveMode.js';

export function detectAiAgent(): string | undefined {
	for (const [envVar, agent] of AGENT_ENV_VARS) {
		if (process.env[envVar]) {
			return agent;
		}
	}

	return undefined;
}

export function detectCi(): { isCi: boolean; ciProvider: string | undefined } {
	if (!ciInfo.isCI) {
		return { isCi: false, ciProvider: undefined };
	}

	return { isCi: true, ciProvider: ciInfo.id?.toLowerCase() ?? 'unknown' };
}

export function detectIsInteractive(): boolean {
	return !isNonInteractive() && !!process.stdin.isTTY && !!process.stdout.isTTY;
}
