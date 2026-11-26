import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { TELEMETRY_FILE_PATH } from '../../../../src/lib/consts.js';
import { trackEvent } from '../../../../src/lib/hooks/telemetry/trackEvent.js';
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
