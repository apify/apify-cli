import { setTimeout as sleep } from 'node:timers/promises';

import { loginWithDeviceCode } from '../../../../src/lib/oauth/device-code.js';
import type { AuthorizationServerMetadata } from '../../../../src/lib/oauth/discovery.js';

vi.mock('node:timers/promises', async (importOriginal) => ({
	...(await importOriginal<typeof import('node:timers/promises')>()),
	setTimeout: vi.fn(async (_ms: number, _value: unknown, opts?: { signal?: AbortSignal }) => {
		if (opts?.signal?.aborted) throw new Error('The operation was aborted');
	}),
}));

const ISSUER = 'https://issuer.test';
const CLIENT_ID = 'https://client.test/oauth-client.json';

const metadata: AuthorizationServerMetadata = {
	issuer: ISSUER,
	device_authorization_endpoint: `${ISSUER}/oauth/apps/devices`,
	token_endpoint: `${ISSUER}/oauth/apps/token`,
};

const deviceResponse = {
	device_code: 'dev-code',
	user_code: 'ABCD-EFGH',
	verification_uri: 'https://console.test/authorize/device',
	verification_uri_complete: 'https://console.test/authorize/device?code=ABCD-EFGH',
	expires_in: 300,
	interval: 5,
};

const tokens = {
	access_token: 'integration_api_token_new',
	token_type: 'Bearer',
	scope: 'full_api_access',
	expires_in: 3599,
	refresh_token: 'rt-1',
	refresh_token_expires_in: 5183999,
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const oauthError = (error: string) => json({ error }, 400);

/** Routes the device endpoint to `device` and hands out `tokenResponses` in order for the token endpoint. */
const mockServer = (device: () => Response, tokenResponses: (() => Response)[]) => {
	const queue = [...tokenResponses];
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const url = String(input);
		if (url === metadata.device_authorization_endpoint) return device();
		if (url === metadata.token_endpoint) return queue.shift()!();
		throw new Error(`unexpected fetch ${url}`);
	});
};

const sleepDurations = () => vi.mocked(sleep).mock.calls.map(([ms]) => ms);

const formBody = (call: [RequestInfo | URL, RequestInit?]) => Object.fromEntries(call[1]!.body as URLSearchParams);

describe('loginWithDeviceCode', () => {
	beforeEach(() => {
		vi.mocked(sleep).mockClear();
	});

	it('is unsupported when the server has no device authorization endpoint', async () => {
		const onPrompt = vi.fn();
		const result = await loginWithDeviceCode({
			metadata: { issuer: ISSUER, token_endpoint: metadata.token_endpoint },
			clientId: CLIENT_ID,
			onPrompt,
		});

		expect(result).toMatchObject({ unsupported: true });
		expect(onPrompt).not.toHaveBeenCalled();
	});

	it('is unsupported when the device authorization request fails before the user is involved', async () => {
		mockServer(() => json({ error: 'not_found' }, 404), []);
		const onPrompt = vi.fn();

		const result = await loginWithDeviceCode({ metadata, clientId: CLIENT_ID, onPrompt });

		expect(result).toMatchObject({ unsupported: true });
		expect(onPrompt).not.toHaveBeenCalled();
	});

	it('prompts, polls at the server interval, and returns the tokens', async () => {
		const fetchSpy = mockServer(
			() => json(deviceResponse, 201),
			[() => oauthError('authorization_pending'), () => json(tokens)],
		);
		const onPrompt = vi.fn();

		const result = await loginWithDeviceCode({ metadata, clientId: CLIENT_ID, onPrompt });

		expect(result).toEqual({ tokens });
		expect(onPrompt).toHaveBeenCalledWith({
			verificationUri: deviceResponse.verification_uri,
			verificationUriComplete: deviceResponse.verification_uri_complete,
			userCode: deviceResponse.user_code,
			expiresInSeconds: 300,
		});

		expect(formBody(fetchSpy.mock.calls[0] as never)).toEqual({ client_id: CLIENT_ID, scope: 'full_api_access' });
		expect(formBody(fetchSpy.mock.calls[1] as never)).toEqual({
			grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
			device_code: 'dev-code',
			client_id: CLIENT_ID,
		});
		expect(sleepDurations()).toEqual([5000, 5000]);
	});

	it('honours a non-default interval from the server', async () => {
		mockServer(() => json({ ...deviceResponse, interval: 7 }, 201), [() => json(tokens)]);

		await loginWithDeviceCode({ metadata, clientId: CLIENT_ID, onPrompt: vi.fn() });

		expect(sleepDurations()).toEqual([7000]);
	});

	it('falls back to a 5 second interval when the server omits it', async () => {
		const { interval: _omitted, ...withoutInterval } = deviceResponse;
		mockServer(() => json(withoutInterval, 201), [() => json(tokens)]);

		await loginWithDeviceCode({ metadata, clientId: CLIENT_ID, onPrompt: vi.fn() });

		expect(sleepDurations()).toEqual([5000]);
	});

	it('adds 5 seconds to the interval on slow_down', async () => {
		mockServer(
			() => json(deviceResponse, 201),
			[() => oauthError('slow_down'), () => oauthError('authorization_pending'), () => json(tokens)],
		);

		await loginWithDeviceCode({ metadata, clientId: CLIENT_ID, onPrompt: vi.fn() });

		expect(sleepDurations()).toEqual([5000, 10_000, 10_000]);
	});

	it('stops when the user denies the request', async () => {
		mockServer(() => json(deviceResponse, 201), [() => oauthError('access_denied')]);

		const result = await loginWithDeviceCode({ metadata, clientId: CLIENT_ID, onPrompt: vi.fn() });

		expect(result).toMatchObject({ stopReason: 'accessDenied' });
	});

	it('stops when the device code expires', async () => {
		mockServer(() => json(deviceResponse, 201), [() => oauthError('expired_token')]);

		const result = await loginWithDeviceCode({ metadata, clientId: CLIENT_ID, onPrompt: vi.fn() });

		expect(result).toMatchObject({ stopReason: 'expired' });
	});

	it('keeps polling through a transient network error', async () => {
		const queue = [() => Promise.reject(new Error('ECONNRESET')), async () => json(tokens)];
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			if (String(input) === metadata.device_authorization_endpoint) return json(deviceResponse, 201);
			return queue.shift()!();
		});

		const result = await loginWithDeviceCode({ metadata, clientId: CLIENT_ID, onPrompt: vi.fn() });

		expect(result).toEqual({ tokens });
	});

	it('stops when aborted', async () => {
		mockServer(() => json(deviceResponse, 201), []);
		const controller = new AbortController();
		controller.abort();

		const result = await loginWithDeviceCode({
			metadata,
			clientId: CLIENT_ID,
			signal: controller.signal,
			onPrompt: vi.fn(),
		});

		expect(result).toMatchObject({ stopReason: 'aborted' });
	});
});
