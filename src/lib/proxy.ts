import http from 'node:http';
import process from 'node:process';

const PROXY_ENV_VARS = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'];

/**
 * Sends the CLI's `fetch` requests, the Apify API client's included, through the proxy the environment names.
 * Node.js older than 24.14 can't do that at runtime and needs `NODE_USE_ENV_PROXY=1`. Bun reads the variables itself.
 */
export function useProxyFromEnv(
	env: NodeJS.ProcessEnv = process.env,
	setGlobalProxyFromEnv: typeof http.setGlobalProxyFromEnv | undefined = http.setGlobalProxyFromEnv,
) {
	if (!PROXY_ENV_VARS.some((name) => env[name])) return;
	if (env.NODE_USE_ENV_PROXY === '1' || process.versions.bun) return;
	if (!setGlobalProxyFromEnv) return;

	try {
		setGlobalProxyFromEnv(env);
	} catch {
		// An unusable proxy URL fails the first request instead, with an error that names it.
	}
}
