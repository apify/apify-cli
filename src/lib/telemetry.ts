import { readFileSync, writeFileSync } from 'node:fs';
import { promisify } from 'node:util';

import Mixpanel, { type PropertyDict } from 'mixpanel';

import { cryptoRandomObjectId } from '@apify/utilities';

import { MIXPANEL_TOKEN, TELEMETRY_FILE_PATH } from './consts.js';
import { info } from './outputs.js';
import { ensureApifyDirectory, getLocalUserInfo } from './utils.js';

export const mixpanel = Mixpanel.init(MIXPANEL_TOKEN, { keepAlive: false });
const TELEMETRY_WARNING_TEXT =
	'Apify collects telemetry data about general usage of Apify CLI to help us improve the product. ' +
	'This feature is enabled by default, and you can disable it by setting the "APIFY_CLI_DISABLE_TELEMETRY" environment variable to "1". ' +
	'You can find more information about our telemetry in https://docs.apify.com/cli/docs/telemetry.';

const promisifiedTrack = promisify<string, PropertyDict, void>(mixpanel.track.bind(mixpanel));

/**
 * Returns distinctId for current local environment.
 * Use CLI prefix to distinguish between id generated by CLI.
 */
const createLocalDistinctId = () => `CLI:${cryptoRandomObjectId()}`;

/**
 * Returns telemetry distinctId for current local environment or creates new one.
 *
 */
export const getOrCreateLocalDistinctId = async () => {
	try {
		const telemetry = JSON.parse(readFileSync(TELEMETRY_FILE_PATH(), 'utf-8'));
		return telemetry.distinctId;
	} catch {
		const userInfo = await getLocalUserInfo();
		const distinctId = userInfo.id || createLocalDistinctId();

		// This first time we are tracking telemetry, so we want to notify user about it.
		info({ message: TELEMETRY_WARNING_TEXT });

		ensureApifyDirectory(TELEMETRY_FILE_PATH());
		writeFileSync(TELEMETRY_FILE_PATH(), JSON.stringify({ distinctId }, null, '\t'));

		return distinctId;
	}
};

export const regenerateLocalDistinctId = () => {
	try {
		ensureApifyDirectory(TELEMETRY_FILE_PATH());
		writeFileSync(TELEMETRY_FILE_PATH(), JSON.stringify({ distinctId: createLocalDistinctId() }, null, '\t'));
	} catch {
		// Ignore errors
	}
};

export const isTelemetryEnabled =
	!process.env.APIFY_CLI_DISABLE_TELEMETRY || ['false', '0'].includes(process.env.APIFY_CLI_DISABLE_TELEMETRY);

/**
 * Tracks telemetry event if telemetry is enabled.
 */
export const maybeTrackTelemetry = async ({
	eventName,
	eventData,
}: {
	eventName: string;
	eventData: Record<string, unknown>;
}) => {
	if (!isTelemetryEnabled) return;

	try {
		const distinctId = getOrCreateLocalDistinctId();
		await promisifiedTrack(eventName, {
			distinct_id: distinctId,
			app: 'cli',
			...eventData,
		});
	} catch {
		// Ignore errors
	}
};

/**
 * Uses Apify identity with local distinctId.
 */
export const useApifyIdentity = async (userId: string) => {
	if (!isTelemetryEnabled) return;

	try {
		const distinctId = getOrCreateLocalDistinctId();
		ensureApifyDirectory(TELEMETRY_FILE_PATH());
		writeFileSync(TELEMETRY_FILE_PATH(), JSON.stringify({ distinctId: userId }, null, '\t'));
		await maybeTrackTelemetry({
			eventName: '$create_alias',
			eventData: {
				alias: distinctId,
			},
		});
	} catch {
		// Ignore errors
	}
};
