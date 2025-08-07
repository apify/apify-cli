import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { updateTelemetryEnabled, useTelemetryState } from '../../lib/hooks/telemetry/useTelemetryState.js';
import { info, success } from '../../lib/outputs.js';

export class TelemetryEnableCommand extends ApifyCommand<typeof TelemetryEnableCommand> {
	static override name = 'enable' as const;

	static override description = 'Enables telemetry.';

	async run() {
		const currentState = await useTelemetryState();

		if (currentState.enabled) {
			info({ message: 'Telemetry is already enabled.' });
		} else {
			await updateTelemetryEnabled(true);

			success({ message: 'Telemetry enabled.' });
		}
	}
}
