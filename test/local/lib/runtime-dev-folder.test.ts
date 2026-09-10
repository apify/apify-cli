import {
	DEV_FOLDER_OFF_RUN_PARAMS,
	formatLiveDevFolderWarning,
	getActorRuntimeDevFolder,
	mayTargetActorRuntime,
	setActorRuntimeDevFolder,
	toActorRuntimeDevFolderPath,
} from '../../../src/lib/runtime/dev-folder.js';

const RUNTIME_BASE_URL = 'http://localhost:3333/v2';
const client = { baseUrl: RUNTIME_BASE_URL, token: 'my-token' };

const jsonResponse = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('mayTargetActorRuntime', () => {
	it('is false for the Apify cloud API, so no runtime-only request is ever spent there', () => {
		expect(mayTargetActorRuntime({ baseUrl: 'https://api.apify.com/v2' })).toBe(false);
		expect(mayTargetActorRuntime({ baseUrl: 'https://api.staging.apify.com/v2' })).toBe(false);
	});

	it('is true for anything else - a local runtime, or a custom base URL', () => {
		expect(mayTargetActorRuntime({ baseUrl: RUNTIME_BASE_URL })).toBe(true);
		expect(mayTargetActorRuntime({ baseUrl: 'http://runtime.internal:3333/v2' })).toBe(true);
	});

	it('is false for an unparseable base URL', () => {
		expect(mayTargetActorRuntime({ baseUrl: 'not a url' })).toBe(false);
	});
});

describe('toActorRuntimeDevFolderPath', () => {
	it('leaves POSIX paths alone', () => {
		expect(toActorRuntimeDevFolderPath('/home/me/my-actor', 'linux')).toBe('/home/me/my-actor');
		expect(toActorRuntimeDevFolderPath('/Users/me/my-actor', 'darwin')).toBe('/Users/me/my-actor');
	});

	it('turns a Windows drive path into the /c/... form Docker Desktop resolves on the host', () => {
		expect(toActorRuntimeDevFolderPath('C:\\Users\\me\\my-actor', 'win32')).toBe('/c/Users/me/my-actor');
		expect(toActorRuntimeDevFolderPath('D:/work/actor', 'win32')).toBe('/d/work/actor');
	});
});

describe('setActorRuntimeDevFolder', () => {
	const fetchMock = vitest.fn<typeof fetch>();

	beforeEach(() => {
		fetchMock.mockReset();
		vitest.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		vitest.unstubAllGlobals();
	});

	it('POSTs the path as a JSON string to the runtime endpoint under the /v2 alias, with the token', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: { localDevFolder: '/abs/actor' } }));

		const result = await setActorRuntimeDevFolder(client, 'actor123', '/abs/actor');

		expect(result).toEqual({ kind: 'ok', localDevFolder: '/abs/actor' });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe(`${RUNTIME_BASE_URL}/actor-runtime/dev-folder/actor123`);
		expect(init?.method).toBe('POST');
		expect(init?.body).toBe(JSON.stringify('/abs/actor'));
		expect(init?.headers).toMatchObject({ Authorization: 'Bearer my-token' });
	});

	it('clears with the empty string when given null', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: { localDevFolder: null } }));

		const result = await setActorRuntimeDevFolder(client, 'actor123', null);

		expect(result).toEqual({ kind: 'ok', localDevFolder: null });
		expect(fetchMock.mock.calls[0][1]?.body).toBe('""');
	});

	it('reports a 404 as unsupported - the target is not an Actor runtime', async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse(404, { error: { type: 'record-not-found', message: 'no API endpoint at this URL' } }),
		);

		expect(await setActorRuntimeDevFolder(client, 'actor123', '/abs/actor')).toEqual({ kind: 'unsupported' });
	});

	it("surfaces the runtime's own message when it refuses the path", async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse(400, {
				error: { type: 'dev-folder-path-not-found', message: 'The submitted path does not exist on the host.' },
			}),
		);

		expect(await setActorRuntimeDevFolder(client, 'actor123', '/abs/missing')).toEqual({
			kind: 'rejected',
			message: 'The submitted path does not exist on the host.',
		});
	});

	it('falls back to the HTTP status when a failure has no JSON body', async () => {
		fetchMock.mockResolvedValueOnce(new Response('gateway down', { status: 502, statusText: 'Bad Gateway' }));

		expect(await setActorRuntimeDevFolder(client, 'actor123', '/abs/actor')).toEqual({
			kind: 'rejected',
			message: '502 Bad Gateway',
		});
	});

	it('never throws on a network failure', async () => {
		fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));

		expect(await setActorRuntimeDevFolder(client, 'actor123', '/abs/actor')).toEqual({
			kind: 'unreachable',
			message: 'ECONNREFUSED',
		});
	});
});

describe('getActorRuntimeDevFolder', () => {
	const fetchMock = vitest.fn<typeof fetch>();

	beforeEach(() => {
		fetchMock.mockReset();
		vitest.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		vitest.unstubAllGlobals();
	});

	it('GETs the registration without a body and reads it back', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: { localDevFolder: '/abs/actor' } }));

		expect(await getActorRuntimeDevFolder(client, 'actor123')).toEqual({ kind: 'ok', localDevFolder: '/abs/actor' });
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe(`${RUNTIME_BASE_URL}/actor-runtime/dev-folder/actor123`);
		expect(init?.method).toBe('GET');
		expect(init?.body).toBeUndefined();
		expect(init?.headers).not.toHaveProperty('Content-Type');
	});

	it('reports null when nothing is registered', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: { localDevFolder: null } }));

		expect(await getActorRuntimeDevFolder(client, 'actor123')).toEqual({ kind: 'ok', localDevFolder: null });
	});

	it('reports a 404 as unsupported - an older runtime without the GET, or not a runtime at all', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse(404, { error: { type: 'record-not-found' } }));

		expect(await getActorRuntimeDevFolder(client, 'actor123')).toEqual({ kind: 'unsupported' });
	});
});

describe('formatLiveDevFolderWarning', () => {
	it('names the folder, the compile requirement, and the way out', () => {
		const text = formatLiveDevFolderWarning('/abs/actor');

		expect(text).toContain('LIVE DEV FOLDER MODE');
		expect(text).toContain('/abs/actor');
		expect(text).toContain('TS-based Actors require local compilation');
		expect(text).toContain('apify call --no-dev-folder');
	});
});

describe('DEV_FOLDER_OFF_RUN_PARAMS', () => {
	it('is the query parameter the runtime documents for a per-run opt-out', () => {
		expect(DEV_FOLDER_OFF_RUN_PARAMS).toEqual({ devFolder: 'false' });
	});
});
