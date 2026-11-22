import { LOCAL_CONFIG_PATH } from '../consts.js';
import type { TrackEventMap } from '../hooks/telemetry/trackEvent.js';
import { warning } from '../outputs.js';

export type DeprecationKind = 'environmentVariables' | 'secretsCommand';

const MESSAGES: Record<DeprecationKind, string> = {
	environmentVariables: `"environmentVariables" in ${LOCAL_CONFIG_PATH} is deprecated and will be removed in the next major version. Put local values in .env, and run apify env migrate to move them.`,
	secretsCommand:
		'apify secrets and "@secret" references are deprecated and will be removed in the next major version. Put local values in .env, and set platform values with apify env set or apify env push.',
};

const printed = new Set<DeprecationKind>();

/**
 * Prints the warning to stderr at most once per process for each kind, and records the kind in
 * telemetryData.deprecationWarnings (deduplicated).
 */
export function warnDeprecated(kind: DeprecationKind, telemetryData: TrackEventMap['cli_command']): void {
	if (!printed.has(kind)) {
		printed.add(kind);
		warning({ message: MESSAGES[kind] });
	}

	telemetryData.deprecationWarnings ??= [];
	if (!telemetryData.deprecationWarnings.includes(kind)) {
		telemetryData.deprecationWarnings.push(kind);
	}
}

export function __resetDeprecationWarningsForTests(): void {
	printed.clear();
}
