import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	looksLikeUncompiledTypeScriptActor,
	mayTargetActorRuntime,
	mentionsMissingModule,
	registerActorRuntimeDevFolder,
	uncompiledDevFolderHint,
} from '../../../src/lib/runtime/dev-folder.js';

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

describe('mentionsMissingModule', () => {
	it("matches Node's CommonJS and ESM wording for a module it could not load", () => {
		expect(mentionsMissingModule("Error: Cannot find module '/usr/src/app/dist/main.js'\n")).toBe(true);
		expect(mentionsMissingModule("  code: 'MODULE_NOT_FOUND',\n")).toBe(true);
		expect(
			mentionsMissingModule(
				"Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/usr/src/app/dist/main.js' imported from",
			),
		).toBe(true);
	});

	it('ignores ordinary output, including other errors', () => {
		expect(mentionsMissingModule('INFO  Starting the crawl\n')).toBe(false);
		expect(mentionsMissingModule('TypeError: Cannot read properties of undefined\n')).toBe(false);
	});
});

describe('looksLikeUncompiledTypeScriptActor', () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'apify-cli-uncompiled-'));
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it('is true for a tsconfig.json with no dist directory', () => {
		writeFileSync(join(dir, 'tsconfig.json'), '{}');

		expect(looksLikeUncompiledTypeScriptActor(dir)).toBe(true);
	});

	it('is false once dist exists', () => {
		writeFileSync(join(dir, 'tsconfig.json'), '{}');
		mkdirSync(join(dir, 'dist'));

		expect(looksLikeUncompiledTypeScriptActor(dir)).toBe(false);
	});

	it('is false for a project without tsconfig.json - plain JavaScript or Python needs no compile step', () => {
		writeFileSync(join(dir, 'package.json'), '{}');

		expect(looksLikeUncompiledTypeScriptActor(dir)).toBe(false);
	});

	it('names the directory, the compile step, and the opt-out flag in the hint', () => {
		const hint = uncompiledDevFolderHint(dir);

		expect(hint).toContain(dir);
		expect(hint).toContain('tsconfig.json');
		expect(hint).toContain('dist/');
		expect(hint).toContain('npm run build');
		expect(hint).toContain('apify call --no-dev-folder');
	});
});
