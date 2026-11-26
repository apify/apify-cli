import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { TELEMETRY_FILE_PATH } from '../../../../src/lib/consts.js';
import { sendEvent, trackEvent } from '../../../../src/lib/hooks/telemetry/trackEvent.js';
import { useAuthSetup } from '../../../__setup__/hooks/useAuthSetup.js';

// Also isolates the telemetry state file, and restores the env var stubbed below.
useAuthSetup();

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('trackEvent', () => {
	it("skips the event instead of throwing when the telemetry state file can't be read", async () => {
		vi.stubEnv('APIFY_CLI_DISABLE_TELEMETRY', '0');

		const fetchMock = vi.fn<typeof fetch>();
		vi.stubGlobal('fetch', fetchMock);

		mkdirSync(dirname(TELEMETRY_FILE_PATH()), { recursive: true });
		writeFileSync(TELEMETRY_FILE_PATH(), '{ "version": 1, "enabled": true }\t"lastCommandExitCode": 1\n}');

		await expect(trackEvent('cli_command', {} as never)).resolves.toBeUndefined();
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe('sendEvent', () => {
	it('masks a credential in any property, however deep, before the event leaves', async () => {
		const fetchMock = vi.fn<typeof fetch>(async () => new Response('{"success":true}', { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		const secret = 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8';

		await sendEvent('cli_command', {
			commandString: `call --token apify_api_${secret}`,
			flagsUsed: ['json', `token=${secret}`],
			push: { actorId: `apify_api_${secret}` },
			exitCode: 1,
		} as never);

		const body = fetchMock.mock.calls[0][1]!.body as string;
		expect(body).not.toContain(secret);
		expect(JSON.parse(body).properties).toMatchObject({
			commandString: 'call --token apify_api_***',
			flagsUsed: ['json', 'token=***'],
			push: { actorId: 'apify_api_***' },
			exitCode: 1,
			app: 'cli',
		});
	});
});
