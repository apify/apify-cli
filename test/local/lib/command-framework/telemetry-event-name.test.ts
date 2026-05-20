/* eslint-disable max-classes-per-file */
import { parseArgs } from 'node:util';

const { trackEventMock } = vi.hoisted(() => ({
	trackEventMock: vi.fn(),
}));

vi.mock('../../../../src/lib/hooks/telemetry/trackEvent.js', () => ({
	trackEvent: trackEventMock,
}));

vi.mock('../../../../src/lib/hooks/telemetry/useTelemetryState.js', () => ({
	checkAndUpdateLastCommand: vi.fn().mockResolvedValue(false),
}));

import {
	ApifyCommand,
	type BuiltApifyCommand as _BuiltApifyCommand,
} from '../../../../src/lib/command-framework/apify-command.js';

const BuiltApifyCommand = ApifyCommand as typeof _BuiltApifyCommand;

class NoOpCommand extends BuiltApifyCommand {
	static override name = 'noop' as const;
	static override description = 'Does nothing.';

	async run() {
		// no-op
	}
}

describe('command telemetry event naming', () => {
	test('emits only the unified command telemetry event', async () => {
		const instance = new NoOpCommand('apify', 'datasets ls', 'datasets');
		// eslint-disable-next-line dot-notation
		const parserOptions = instance['_buildParseArgsOption']();
		const parsed = parseArgs({ ...parserOptions, args: [] });

		// eslint-disable-next-line dot-notation
		await instance['_run'](parsed);

		expect(trackEventMock).toHaveBeenCalledWith(
			'cli_command',
			expect.objectContaining({
				commandString: 'datasets ls',
				entrypoint: 'apify',
				installMethod: expect.any(String),
				osArch: expect.any(String),
				runtime: expect.any(String),
				runtimeVersion: expect.any(String),
				runtimeNodeVersion: expect.anything(),
				flagsUsed: expect.any(Array),
				exitCode: expect.any(Number),
				durationMs: expect.any(Number),
				isCi: expect.any(Boolean),
				isInteractive: expect.any(Boolean),
				wasRetried: expect.any(Boolean),
			}),
		);
		expect(trackEventMock).toHaveBeenCalledTimes(1);
	});
});
