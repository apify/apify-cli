import process from 'node:process';

import { readActorRuntimeConfig, updateActorRuntimeConfig } from './config.js';
import { DEFAULT_RUNTIME_PORTS, runtimeUrl, type RuntimePorts } from './docker.js';

/** The variables that point the CLI somewhere else; they win over the connection wherever they are set. */
const RUNTIME_ENV_VARS = ['APIFY_CLIENT_BASE_URL', 'APIFY_CONSOLE_URL'];

/** Whether `apify runtime connect` pointed the CLI at the local Actor runtime. */
export function isConnectedToActorRuntime(): boolean {
	return readActorRuntimeConfig().connected === true;
}

export function setConnectedToActorRuntime(connected: boolean) {
	updateActorRuntimeConfig({ connected });
}

/** The ports the runtime was last started with. */
export function configuredRuntimePorts(): RuntimePorts {
	const { apiPort, consolePort } = readActorRuntimeConfig();
	return { api: apiPort ?? DEFAULT_RUNTIME_PORTS.api, console: consolePort ?? DEFAULT_RUNTIME_PORTS.console };
}

export function overridingRuntimeEnvVars(env: NodeJS.ProcessEnv = process.env): [string, string][] {
	return RUNTIME_ENV_VARS.filter((name) => env[name]).map((name) => [name, env[name]!]);
}

/**
 * The API the CLI talks to: `APIFY_CLIENT_BASE_URL` when set, else the local Actor runtime while
 * `apify runtime connect` is in effect, else undefined for the Apify platform default.
 */
export function resolveApiBaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
	return (
		env.APIFY_CLIENT_BASE_URL || (isConnectedToActorRuntime() ? runtimeUrl(configuredRuntimePorts().api) : undefined)
	);
}

/** The Console the CLI links to, resolved the same way as {@link resolveApiBaseUrl}. */
export function resolveConsoleUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
	return (
		env.APIFY_CONSOLE_URL || (isConnectedToActorRuntime() ? runtimeUrl(configuredRuntimePorts().console) : undefined)
	);
}
