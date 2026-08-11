import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { createLocalApiServer, type LocalApiResponse } from '../../../src/lib/local-api-server.js';

const ORIGIN = 'https://console.apify.com';
const AUTH_TOKEN = 'test-auth-token-123';

describe('createLocalApiServer', () => {
	let server: Server;
	let base: string;
	let receivedBodies: Record<string, any>[];

	beforeAll(async () => {
		receivedBodies = [];

		server = createLocalApiServer({
			corsOrigin: ORIGIN,
			authToken: AUTH_TOKEN,
			routes: {
				'POST /api/v1/login-token': async (body, res: LocalApiResponse) => {
					receivedBodies.push(body);
					if (!body.apiToken) {
						res.status(500);
						res.send('Request did not contain API token');
						return;
					}
					res.end();
				},
				'GET /api/v1/input-schema': (_, res) => {
					res.send({ title: 'Schema', type: 'object' });
				},
			},
		});

		server.listen(0);
		await new Promise((resolve) => server.once('listening', resolve));
		const { port } = server.address() as AddressInfo;
		base = `http://127.0.0.1:${port}`;
	});

	afterAll(async () => {
		await new Promise((resolve) => server.close(resolve));
	});

	it('answers CORS preflight before the auth check', async () => {
		const res = await fetch(`${base}/api/v1/login-token`, {
			method: 'OPTIONS',
			headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST' },
		});

		expect(res.status).toBe(204);
		expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
		expect(res.headers.get('access-control-allow-headers')).toBe('Content-Type, Authorization');
	});

	it('rejects requests without a token', async () => {
		const res = await fetch(`${base}/api/v1/login-token`, { method: 'POST' });

		expect(res.status).toBe(401);
		expect(await res.text()).toBe('Authorization failed');
	});

	it('rejects a wrong Bearer token', async () => {
		const res = await fetch(`${base}/api/v1/login-token`, {
			method: 'POST',
			headers: { Authorization: 'Bearer wrong-token' },
		});

		expect(res.status).toBe(401);
	});

	it('rejects a malformed Authorization header even with the right token', async () => {
		const res = await fetch(`${base}/api/v1/login-token`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${AUTH_TOKEN} extra` },
		});

		expect(res.status).toBe(401);
	});

	it('accepts the token via query param and delivers the JSON body', async () => {
		const res = await fetch(`${base}/api/v1/login-token?token=${AUTH_TOKEN}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ apiToken: 'my-api-token' }),
		});

		expect(res.status).toBe(200);
		expect(receivedBodies.at(-1)).toEqual({ apiToken: 'my-api-token' });
		expect(res.headers.get('connection')).toBe('close');
		expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
	});

	it('accepts the token via Bearer header and sends JSON responses', async () => {
		const res = await fetch(`${base}/api/v1/input-schema`, {
			headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
		});

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ title: 'Schema', type: 'object' });
	});

	it('treats a missing body as an empty object', async () => {
		const res = await fetch(`${base}/api/v1/login-token?token=${AUTH_TOKEN}`, { method: 'POST' });

		expect(res.status).toBe(500);
		expect(await res.text()).toBe('Request did not contain API token');
		expect(receivedBodies.at(-1)).toEqual({});
	});

	it('returns 404 for unknown routes and mismatched methods', async () => {
		const unknownPath = await fetch(`${base}/api/v1/nope?token=${AUTH_TOKEN}`, { method: 'POST' });
		expect(unknownPath.status).toBe(404);

		const wrongMethod = await fetch(`${base}/api/v1/input-schema?token=${AUTH_TOKEN}`, { method: 'POST' });
		expect(wrongMethod.status).toBe(404);
	});

	it('returns 400 for malformed JSON bodies', async () => {
		const res = await fetch(`${base}/api/v1/login-token?token=${AUTH_TOKEN}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: '{oops',
		});

		expect(res.status).toBe(400);
		expect(await res.text()).toBe('Invalid JSON body');
	});
});
