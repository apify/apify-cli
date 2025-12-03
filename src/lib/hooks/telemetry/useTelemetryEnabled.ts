import { cliDebugPrint } from '../../utils/cliDebugPrint.js';
import { isTelemetryDisabledInThisEnv, useTelemetryState } from './useTelemetryState.js';

export async function useTelemetryEnabled() {
	// Env variable present and not false/0
	if (process.env.APIFY_CLI_DISABLE_TELEMETRY && !['false', '0'].includes(process.env.APIFY_CLI_DISABLE_TELEMETRY)) {
		cliDebugPrint('telemetry', 'disabled by env variable');

		return false;
	}

	const telemetryState = await useTelemetryState();

	cliDebugPrint('telemetry state', { telemetryState });

	return telemetryState.enabled && !isTelemetryDisabledInThisEnv();
}
