import { createServer } from 'node:net';
import process from 'node:process';

import { ApifyClient } from 'apify-client';

import { getAnonymousApifyClientOptions } from '../../../src/lib/auth.js';
import {
	ActorRuntimeNotRunningError,
	runtimeDownInterceptor,
	targetsConnectedRuntime,
} from '../../../src/lib/runtime/client.js';
import { updateActorRuntimeConfig } from '../../../src/lib/runtime/config.js';
import * as docker from '../../../src/lib/runtime/docker.js';
import { setConnectedToActorRuntime } from '../../../src/lib/runtime/target.js';
import { useAuthSetup } from '../../__setup__/hooks/useAuthSetup.js';

vi.mock('../../../src/lib/runtime/docker.js', async (importOriginal) => ({
	...(await importOriginal<typeof docker>()),
	findRunningRuntimeEngine: vi.fn(),
}));

useAuthSetup();

const findRunningRuntimeEngine = vi.mocked(docker.findRunningRuntimeEngine);

/** A port nothing listens on, so a connection to it is refused at once. */
async function freePort(): Promise<number> {
	const server = createServer();
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const { port } = server.address() as { port: number };
	await new Promise<void>((resolve) => server.close(() => resolve()));
	return port;
}

describe('runtime/client', () => {
	beforeEach(() => {
		findRunningRuntimeEngine.mockReset();
		delete process.env.APIFY_CLIENT_BASE_URL;
	});

	describe('targetsConnectedRuntime()', () => {
		it('is true only for the connected runtime URL with no environment override', () => {
			expect(targetsConnectedRuntime('http://localhost:3333', {})).toBe(false);

			setConnectedToActorRuntime(true);
			expect(targetsConnectedRuntime('http://localhost:3333', {})).toBe(true);
			expect(targetsConnectedRuntime('https://api.apify.com', {})).toBe(false);
			expect(targetsConnectedRuntime(undefined, {})).toBe(false);
			expect(targetsConnectedRuntime('http://localhost:3333', { APIFY_CLIENT_BASE_URL: 'http://localhost:3333' })).toBe(
				false,
			);

			updateActorRuntimeConfig({ apiPort: 4333 });
			expect(targetsConnectedRuntime('http://localhost:3333', {})).toBe(false);
			expect(targetsConnectedRuntime('http://localhost:4333', {})).toBe(true);
		});
	});

	describe('getAnonymousApifyClientOptions()', () => {
		it('adds the runtime interceptor only while connected', () => {
			expect(getAnonymousApifyClientOptions().requestInterceptors).toHaveLength(1);

			setConnectedToActorRuntime(true);
			expect(getAnonymousApifyClientOptions().requestInterceptors).toContain(runtimeDownInterceptor);
			expect(getAnonymousApifyClientOptions('http://localhost:3333').requestInterceptors).toContain(
				runtimeDownInterceptor,
			);
			expect(getAnonymousApifyClientOptions('https://api.apify.com').requestInterceptors).toHaveLength(1);

			process.env.APIFY_CLIENT_BASE_URL = 'http://localhost:9999';
			expect(getAnonymousApifyClientOptions().requestInterceptors).toHaveLength(1);
		});
	});

	describe('runtimeDownInterceptor', () => {
		it('fails at once when the connection is refused and the runtime container is not running', async () => {
			setConnectedToActorRuntime(true);
			updateActorRuntimeConfig({ apiPort: await freePort() });
			findRunningRuntimeEngine.mockResolvedValue(null);

			const client = new ApifyClient({ ...getAnonymousApifyClientOptions(), token: 'local-dev-token' });

			const started = Date.now();
			await expect(client.user('me').get()).rejects.toBeInstanceOf(ActorRuntimeNotRunningError);
			expect(Date.now() - started).toBeLessThan(2_000);
			expect(findRunningRuntimeEngine).toHaveBeenCalledTimes(1);
		});

		it('keeps the client retrying while the container is running but not listening yet', async () => {
			setConnectedToActorRuntime(true);
			updateActorRuntimeConfig({ apiPort: await freePort() });
			findRunningRuntimeEngine.mockResolvedValue('docker');

			const client = new ApifyClient({
				...getAnonymousApifyClientOptions(),
				token: 'local-dev-token',
				maxRetries: 2,
				minDelayBetweenRetriesMillis: 10,
			});

			await expect(client.user('me').get()).rejects.toMatchObject({ code: 'ECONNREFUSED' });
			expect(findRunningRuntimeEngine).toHaveBeenCalledTimes(3);
		});
	});
});
