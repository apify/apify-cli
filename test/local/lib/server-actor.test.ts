import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { Actor, ApifyClient, Build } from 'apify-client';

import type { ServerActor } from '../../../src/lib/server-actor.js';
import {
	describeServerError,
	getServerInterfaceHint,
	listServerOperations,
	parseServerRequestArgs,
	resolveServerBuild,
	resolveServerRequestUrl,
	shortenSummary,
	watchLocalServerReadiness,
} from '../../../src/lib/server-actor.js';

const STANDBY_URL = 'https://rag-web-browser.apify.actor';

function fakeClient({
	builds = [],
	buildsById = {},
}: {
	builds?: { id: string; buildNumber: string }[];
	buildsById?: Record<string, Partial<Build>>;
}) {
	return {
		actor: () => ({ builds: () => ({ list: async () => ({ items: builds }) }) }),
		build: (id: string) => ({ get: async () => buildsById[id] }),
	} as unknown as ApifyClient;
}

function serverActor(overrides: Partial<ServerActor> = {}): ServerActor {
	return {
		id: 'actorId',
		userFriendlyId: 'apify/rag-web-browser',
		standbyUrl: STANDBY_URL,
		taggedBuilds: {},
		standby: { isEnabled: true },
		...overrides,
	};
}

describe('server-actor', () => {
	describe('resolveServerRequestUrl()', () => {
		it('resolves a path against the server interface URL', () => {
			expect(resolveServerRequestUrl(STANDBY_URL, '/search?query=x').href).toBe(`${STANDBY_URL}/search?query=x`);
		});

		it('appends query parameters after a query already in the path', () => {
			expect(resolveServerRequestUrl(STANDBY_URL, '/search?a=1', 'b=2').href).toBe(`${STANDBY_URL}/search?a=1&b=2`);
		});

		it('rejects a path without a leading slash', () => {
			expect(() => resolveServerRequestUrl(STANDBY_URL, 'https://evil.example/x')).toThrow('must start with "/"');
		});

		it('rejects a protocol-relative path that changes the host', () => {
			expect(() => resolveServerRequestUrl(STANDBY_URL, '//evil.example/x')).toThrow('points outside');
		});

		it('rejects a backslash path that some parsers treat as protocol-relative', () => {
			expect(() => resolveServerRequestUrl(STANDBY_URL, '/\\evil.example/x')).toThrow('points outside');
		});

		it('rejects the token in the query string', () => {
			expect(() => resolveServerRequestUrl(STANDBY_URL, '/search?token=abc')).toThrow('Authorization header');
			expect(() => resolveServerRequestUrl(STANDBY_URL, '/search', 'token=abc')).toThrow('Authorization header');
		});
	});

	describe('parseServerRequestArgs()', () => {
		it('reads method, target and path', () => {
			expect(parseServerRequestArgs(['post', 'apify/web-fetch', '/x'])).toEqual({
				method: 'POST',
				target: 'apify/web-fetch',
				path: '/x',
			});
		});

		it('leaves the method unset when omitted', () => {
			expect(parseServerRequestArgs(['apify/web-fetch', '/x', undefined])).toEqual({
				method: undefined,
				target: 'apify/web-fetch',
				path: '/x',
			});
		});

		it('treats a leading path as a request to the Actor in the current directory', () => {
			expect(parseServerRequestArgs(['/health', undefined, undefined])).toEqual({
				method: undefined,
				target: undefined,
				path: '/health',
			});
		});

		it('defaults the path to "/"', () => {
			expect(parseServerRequestArgs(['GET', 'apify/web-fetch', undefined]).path).toBe('/');
		});

		it('rejects extra arguments', () => {
			expect(() => parseServerRequestArgs(['apify/web-fetch', '/x', '/y'])).toThrow('Unexpected argument "/y"');
		});
	});

	describe('listServerOperations()', () => {
		it('lists operations with their summaries and skips non-method keys', () => {
			const schema = {
				paths: {
					'/search': {
						get: { summary: 'Search' },
						parameters: [],
					},
					'/': { post: {} },
				},
			};

			expect(listServerOperations(schema)).toEqual([
				{ method: 'GET', path: '/search', summary: 'Search' },
				{ method: 'POST', path: '/', summary: undefined },
			]);
		});

		it('returns no operations for an empty or missing schema', () => {
			expect(listServerOperations({})).toEqual([]);
			expect(listServerOperations(undefined)).toEqual([]);
		});
	});

	describe('resolveServerBuild()', () => {
		it('resolves a build tag through taggedBuilds', async () => {
			const client = fakeClient({ buildsById: { tagged: { id: 'tagged' } } });
			const actor = serverActor({
				buildRef: 'version-1',
				taggedBuilds: { 'version-1': { buildId: 'tagged' } as never },
			});

			expect((await resolveServerBuild(client, actor)).id).toBe('tagged');
		});

		it('resolves a full build number through the build list', async () => {
			const client = fakeClient({
				builds: [
					{ id: 'newer', buildNumber: '1.0.34' },
					{ id: 'pinned', buildNumber: '1.0.33' },
				],
				buildsById: { pinned: { id: 'pinned' } },
			});

			expect((await resolveServerBuild(client, serverActor({ buildRef: '1.0.33' }))).id).toBe('pinned');
		});

		it('does not fall back to another build when the reference is unknown', async () => {
			const client = fakeClient({ buildsById: { latest: { id: 'latest' } } });
			const actor = serverActor({ buildRef: 'beta', taggedBuilds: { latest: { buildId: 'latest' } as never } });

			await expect(resolveServerBuild(client, actor)).rejects.toThrow('uses build "beta", which was not found');
		});
	});

	describe('describeServerError()', () => {
		const routerError = (type: string) => JSON.stringify({ error: { type, message: 'x' } });

		it('separates a failed cold start from rate limiting', () => {
			expect(describeServerError(429, routerError('failed-to-choose-actor-run'))).toContain('within 2 minutes');
			expect(describeServerError(429, routerError('too-many-concurrent-requests'))).toContain('fewer requests');
			expect(describeServerError(429, routerError('rate-limit-exceeded'))).toContain('Your account');
		});

		it('explains a router timeout', () => {
			expect(describeServerError(504, routerError('proxy-timeout'))).toContain('5 minutes');
		});

		it('adds no hint for an error the Actor returned', () => {
			expect(describeServerError(400, 'Missing query parameter')).toBeUndefined();
			expect(describeServerError(429, '{"message":"slow down"}')).toBeUndefined();
		});
	});
	describe('shortenSummary()', () => {
		it('keeps a short summary unchanged', () => {
			expect(shortenSummary('Fetch a URL')).toBe('Fetch a URL');
		});

		it('keeps only the first line', () => {
			expect(shortenSummary('Search\nLonger explanation')).toBe('Search');
		});

		it('cuts a long summary at a word boundary', () => {
			const summary = `${'word '.repeat(30)}end`;
			const short = shortenSummary(summary, 40);

			expect(short.length).toBeLessThanOrEqual(40);
			expect(short).toMatch(/word…$/);
		});
	});

	describe('getServerInterfaceHint()', () => {
		it('points to apify server request for an Actor with a server interface', () => {
			const actor = { actorStandby: { isEnabled: true } } as Actor;

			expect(getServerInterfaceHint(actor, 'apify/web-fetch')).toContain('apify server request apify/web-fetch');
		});

		it('gives no hint for an Actor without one', () => {
			expect(getServerInterfaceHint({} as Actor, 'apify/hello-world')).toBeUndefined();
		});
	});

	describe('watchLocalServerReadiness()', () => {
		it('sends the readiness probe header and stops once the server answers', async () => {
			const probeHeaders: (string | string[] | undefined)[] = [];
			const server = createServer((req, res) => {
				probeHeaders.push(req.headers['x-apify-container-server-readiness-probe']);
				res.end('ok');
			});
			await new Promise<void>((resolve) => {
				server.listen(0, '127.0.0.1', resolve);
			});

			try {
				const { port } = server.address() as AddressInfo;
				await watchLocalServerReadiness(port, new AbortController().signal);

				expect(probeHeaders).toEqual(['1']);
			} finally {
				server.close();
			}
		});

		it('stops when aborted before the server answers', async () => {
			const controller = new AbortController();
			const watching = watchLocalServerReadiness(1, controller.signal);
			controller.abort();

			await expect(watching).resolves.toBeUndefined();
		});
	});
});
