import { resolveLoginApiBaseUrl } from '../../../src/commands/auth/login.js';
import { updateActorRuntimeConfig } from '../../../src/lib/runtime/config.js';
import { setConnectedToActorRuntime } from '../../../src/lib/runtime/target.js';
import { useAuthSetup } from '../../__setup__/hooks/useAuthSetup.js';

useAuthSetup();

describe('apify login API base URL', () => {
	beforeEach(() => {
		vitest.stubEnv('APIFY_CLIENT_BASE_URL', '');
		vitest.stubEnv('APIFY_CONSOLE_URL', '');
	});

	it('validates against the Apify platform by default', () => {
		expect(resolveLoginApiBaseUrl()).toBeUndefined();
	});

	it('falls back to port 3333 for a local Console when no runtime port is known', () => {
		vitest.stubEnv('APIFY_CONSOLE_URL', 'http://localhost:3000');

		expect(resolveLoginApiBaseUrl()).toBe('http://localhost:3333');
	});

	it('uses the port the runtime was last started on for a local Console', () => {
		vitest.stubEnv('APIFY_CONSOLE_URL', 'http://localhost:4000');
		updateActorRuntimeConfig({ apiPort: 4333, consolePort: 4000 });

		expect(resolveLoginApiBaseUrl()).toBe('http://localhost:4333');
	});

	it('targets the connected runtime on its configured port', () => {
		updateActorRuntimeConfig({ apiPort: 4333, consolePort: 4000 });
		setConnectedToActorRuntime(true);

		expect(resolveLoginApiBaseUrl()).toBe('http://localhost:4333');
	});

	it('lets APIFY_CLIENT_BASE_URL win over a local Console and a connected runtime', () => {
		vitest.stubEnv('APIFY_CLIENT_BASE_URL', 'https://api.example.com');
		vitest.stubEnv('APIFY_CONSOLE_URL', 'http://localhost:3000');
		setConnectedToActorRuntime(true);

		expect(resolveLoginApiBaseUrl()).toBe('https://api.example.com');
	});
});
