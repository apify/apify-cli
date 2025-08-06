import { useTelemetryState } from './useTelemetryState.js';

export interface TelemetryIdentifiers {
	anonymousId: string;
	userId?: string | null;
}

export async function useTelemetryIdentifiers(): Promise<TelemetryIdentifiers> {
	const telemetryState = await useTelemetryState();

	return {
		anonymousId: telemetryState.anonymousId,
		userId: telemetryState.userId,
	};
}
