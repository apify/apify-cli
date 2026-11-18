import process from 'node:process';

import type { ApifyClientOptions } from 'apify-client';
import axios from 'axios';

import { findRunningRuntimeEngine, runtimeApiUrl } from './docker.js';
import { configuredRuntimePorts, isConnectedToActorRuntime } from './target.js';

type RequestInterceptor = NonNullable<ApifyClientOptions['requestInterceptors']>[number];

export class ActorRuntimeNotRunningError extends Error {
	constructor(port: number) {
		super(
			`The Apify CLI is connected to the local Actor runtime at ${runtimeApiUrl(port)}, but the runtime isn't running. ` +
				`Start it with 'apify runtime start --detach', or run 'apify runtime disconnect' to target the Apify platform.`,
		);
		this.name = 'ActorRuntimeNotRunningError';
	}
}

/** Whether `baseUrl` is the connected runtime's API, picked by the connection rather than by an environment variable. */
export function targetsConnectedRuntime(baseUrl: string | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
	return (
		!env.APIFY_CLIENT_BASE_URL && isConnectedToActorRuntime() && baseUrl === runtimeApiUrl(configuredRuntimePorts().api)
	);
}

/**
 * Runs on every attempt of every request to the connected runtime. A refused connection triggers one
 * engine status check: a stopped container means a plain error, which apify-client doesn't retry, so
 * the command fails at once instead of after eight backoffs. A running container (still booting, or
 * under load) rethrows the original axios error and keeps the client's normal retry policy.
 */
export const runtimeDownInterceptor: RequestInterceptor = (config) => {
	const send = axios.getAdapter((config.adapter ?? axios.defaults.adapter) as never);
	config.adapter = async (requestConfig) => {
		try {
			return await send(requestConfig);
		} catch (err) {
			if ((err as { code?: string }).code === 'ECONNREFUSED' && !(await findRunningRuntimeEngine())) {
				throw new ActorRuntimeNotRunningError(configuredRuntimePorts().api);
			}
			throw err;
		}
	};
	return config;
};
