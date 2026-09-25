import { readFileSync } from 'node:fs';

import { ACTOR_RUNTIME_CONFIG_FILE_PATH } from '../../../src/lib/consts.js';
import { updateActorRuntimeConfig } from '../../../src/lib/runtime/config.js';
import { ACTOR_RUNTIME_API_URL, ACTOR_RUNTIME_CONSOLE_URL } from '../../../src/lib/runtime/docker.js';
import { rememberInstalledActorRuntimeImage } from '../../../src/lib/runtime/ensure.js';
import {
	configuredRuntimePorts,
	overridingRuntimeEnvVars,
	resolveApiBaseUrl,
	resolveConsoleUrl,
	setConnectedToActorRuntime,
} from '../../../src/lib/runtime/target.js';
import { useAuthSetup } from '../../__setup__/hooks/useAuthSetup.js';

useAuthSetup();

describe('runtime/target', () => {
	it('targets the runtime while connected and the platform otherwise, keeping the installed image', () => {
		rememberInstalledActorRuntimeImage('apify/actor-runtime:master-5462005');

		expect(resolveApiBaseUrl({})).toBeUndefined();
		expect(resolveConsoleUrl({})).toBeUndefined();

		setConnectedToActorRuntime(true);

		expect(resolveApiBaseUrl({})).toBe(ACTOR_RUNTIME_API_URL);
		expect(resolveConsoleUrl({})).toBe(ACTOR_RUNTIME_CONSOLE_URL);
		expect(JSON.parse(readFileSync(ACTOR_RUNTIME_CONFIG_FILE_PATH(), 'utf-8'))).toEqual({
			image: 'apify/actor-runtime:master-5462005',
			connected: true,
		});

		setConnectedToActorRuntime(false);

		expect(resolveApiBaseUrl({})).toBeUndefined();
		expect(resolveConsoleUrl({})).toBeUndefined();
	});

	it('follows the ports the runtime was last started with', () => {
		expect(configuredRuntimePorts()).toEqual({ api: 3333, console: 3000 });

		updateActorRuntimeConfig({ apiPort: 4333, consolePort: 4000 });
		setConnectedToActorRuntime(true);

		expect(configuredRuntimePorts()).toEqual({ api: 4333, console: 4000 });
		expect(resolveApiBaseUrl({})).toBe('http://localhost:4333');
		expect(resolveConsoleUrl({})).toBe('http://localhost:4000');
	});

	it('lets the environment variables win over the connection', () => {
		setConnectedToActorRuntime(true);

		const env = { APIFY_CLIENT_BASE_URL: 'https://api.apify.com', APIFY_CONSOLE_URL: 'https://console.apify.com' };

		expect(resolveApiBaseUrl(env)).toBe('https://api.apify.com');
		expect(resolveConsoleUrl(env)).toBe('https://console.apify.com');
		expect(overridingRuntimeEnvVars(env)).toEqual([
			['APIFY_CLIENT_BASE_URL', 'https://api.apify.com'],
			['APIFY_CONSOLE_URL', 'https://console.apify.com'],
		]);
		expect(overridingRuntimeEnvVars({})).toEqual([]);
	});
});
