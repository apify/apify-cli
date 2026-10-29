import { mayTargetActorRuntime, registerActorRuntimeDevFolder } from '../../../src/lib/runtime/dev-folder.js';

const client = { baseUrl: 'http://localhost:3333/v2', token: 'my-token' };

describe('mayTargetActorRuntime', () => {
	it('is false for the Apify cloud API and true for anything else', () => {
		expect(mayTargetActorRuntime({ baseUrl: 'https://api.apify.com/v2' })).toBe(false);
		expect(mayTargetActorRuntime({ baseUrl: 'http://localhost:3333/v2' })).toBe(true);
	});
});

describe('registerActorRuntimeDevFolder', () => {
	const fetchMock = vitest.fn<typeof fetch>();

	beforeEach(() => {
		fetchMock.mockReset();
		vitest.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		vitest.unstubAllGlobals();
	});

	it('POSTs the path as a JSON string to the runtime endpoint, with the token', async () => {
		fetchMock.mockResolvedValueOnce(new Response('{"data":{"localDevFolder":"/abs/actor"}}', { status: 200 }));

		expect(await registerActorRuntimeDevFolder(client, 'actor123', '/abs/actor')).toEqual({ ok: true });
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('http://localhost:3333/v2/actor-runtime/dev-folder/actor123');
		expect(init?.method).toBe('POST');
		expect(init?.body).toBe('"/abs/actor"');
		expect(init?.headers).toMatchObject({ Authorization: 'Bearer my-token' });
	});

	it('treats a 404 as "not an Actor runtime", with nothing to report', async () => {
		fetchMock.mockResolvedValueOnce(new Response('{"error":{"type":"record-not-found"}}', { status: 404 }));

		expect(await registerActorRuntimeDevFolder(client, 'actor123', '/abs/actor')).toEqual({ ok: false });
	});

	it("reports the runtime's own reason when it refuses the path", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response('{"error":{"message":"The submitted path does not exist on the host."}}', { status: 400 }),
		);

		expect(await registerActorRuntimeDevFolder(client, 'actor123', '/abs/missing')).toEqual({
			ok: false,
			error: 'The submitted path does not exist on the host.',
		});
	});
});
