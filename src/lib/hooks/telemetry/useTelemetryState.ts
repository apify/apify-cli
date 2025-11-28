import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { cryptoRandomObjectId } from '@apify/utilities';

import { TELEMETRY_FILE_PATH } from '../../consts.js';
import { info } from '../../outputs.js';

type TelemetryState = TelemetryStateV0 | TelemetryStateV1;

type LatestTelemetryState = TelemetryStateV1;

interface TelemetryStateV0 {
	distinctId: string;
	version?: never;
}

interface TelemetryStateV1 {
	version: 1;
	enabled: boolean;
	userId?: string | null;
	anonymousId: string;
}

const telemetryWarningText = [
	'Apify collects telemetry data about general usage of Apify CLI to help us improve the product.',
	'This feature is enabled by default, and you can disable it by setting the "APIFY_CLI_DISABLE_TELEMETRY" environment variable to "1", or by running "apify telemetry disable".',
	'You can find more information about our telemetry in https://docs.apify.com/cli/docs/telemetry.',
].join('\n');

function createAnonymousId() {
	return `CLI:${cryptoRandomObjectId()}`;
}

export function isTelemetryDisabledInThisEnv() {
	// return getApifyAPIBaseUrl() !== 'https://api.apify.com';
}

async function migrateStateV0ToV1(state: TelemetryState) {
	if (state.version && state.version >= 1) {
		return false;
	}

	createAnonymousId();
	// const casted = state as TelemetryStateV0;

	// const existingAuthState = await getLocalUserInfo().catch(() => ({}) as AuthJSON);

	// updateTelemetryState({ version: 1, enabled: true } as never, (stateToUpdate) => {
	// 	if (existingAuthState.id && casted.distinctId === existingAuthState.id) {
	// stateToUpdate.anonymousId = createAnonymousId();
	// 		stateToUpdate.userId = existingAuthState.id;
	// 	} else {
	// 		stateToUpdate.anonymousId = casted.distinctId;
	// 	}
	// });

	return true;
}

export async function useTelemetryState(): Promise<LatestTelemetryState> {
	const filePath = TELEMETRY_FILE_PATH();

	const exists = existsSync(filePath);

	if (!exists) {
		// const existingAuthState = await getLocalUserInfo().catch(() => ({}) as AuthJSON);

		// updateTelemetryState({
		// 	version: 1,
		// 	enabled: true,
		// 	anonymousId: createAnonymousId(),
		// 	userId: existingAuthState.id,
		// });

		// First time we are tracking telemetry, so we want to notify user about it.
		info({ message: telemetryWarningText });

		return useTelemetryState();
	}

	const state = JSON.parse(readFileSync(filePath, 'utf-8')) as TelemetryState;

	if (await migrateStateV0ToV1(state)) {
		return useTelemetryState();
	}

	const casted = state as LatestTelemetryState;

	return casted;
}

export type StateUpdater = (state: LatestTelemetryState) => void;

function updateTelemetryState(state: LatestTelemetryState, updater?: StateUpdater) {
	// Update the state in memory
	const stateClone = { ...state };
	updater?.(stateClone);

	const filePath = TELEMETRY_FILE_PATH();
	const dirPath = dirname(filePath);

	mkdirSync(dirPath, { recursive: true });

	writeFileSync(TELEMETRY_FILE_PATH(), JSON.stringify(stateClone, null, '\t'));
}

export async function updateUserId(userId: string | null) {
	// if (isTelemetryDisabledInThisEnv()) return;

	const state = await useTelemetryState();

	updateTelemetryState(state, (stateToUpdate) => {
		stateToUpdate.userId = userId;
	});
}

export async function updateTelemetryEnabled(enabled: boolean) {
	const state = await useTelemetryState();

	updateTelemetryState(state, (stateToUpdate) => {
		stateToUpdate.enabled = enabled;
	});
}
