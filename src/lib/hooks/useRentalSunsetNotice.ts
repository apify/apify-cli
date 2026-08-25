import { readFile } from 'node:fs/promises';
import process from 'node:process';

import chalk from 'chalk';
import { isCI } from 'ci-info';

import {
	AUTH_FILE_PATH,
	CHECK_RENTAL_ACTORS_EVERY_MILLIS,
	RENTAL_SUNSET_NOTICE_EVERY_MILLIS,
	RENTAL_SUNSET_NOTICE_UNTIL,
} from '../consts.js';
import { simpleLog, warning } from '../outputs.js';
import type { AuthJSON } from '../types.js';
import { cliDebugPrint } from '../utils/cliDebugPrint.js';
import { useCLIMetadata } from './useCLIMetadata.js';
import { type LatestState, updateLocalState, useLocalState } from './useLocalState.js';

const RENTAL_PRICING_MODEL = 'FLAT_PRICE_PER_MONTH';

const DEFAULT_API_BASE_URL = 'https://api.apify.com';

const APIFY_DISCORD_URL = 'https://discord.gg/crawlee-apify-801163717915574323';

export interface RentalSunsetGateInput {
	now: number;
	isCi: boolean;
	skipEnvValue?: string;
	lastNotifiedAt?: number;
}

/**
 * Decides whether the rental sunset notice should be suppressed. Kept pure so the gating rules can
 * be tested without touching the network or the local state file.
 */
export function shouldSkipRentalSunsetNotice({ now, isCi, skipEnvValue, lastNotifiedAt }: RentalSunsetGateInput) {
	if (skipEnvValue && !['0', 'false'].includes(skipEnvValue)) {
		return true;
	}

	// The notice is aimed at a human reading their terminal, printing it into CI logs is just noise.
	if (isCi) {
		return true;
	}

	if (now >= RENTAL_SUNSET_NOTICE_UNTIL) {
		return true;
	}

	if (lastNotifiedAt && now - lastNotifiedAt < RENTAL_SUNSET_NOTICE_EVERY_MILLIS) {
		return true;
	}

	return false;
}

export function renderRentalSunsetNotice(rentalActorCount: number) {
	const actorWord = rentalActorCount === 1 ? 'rental Actor' : 'rental Actors';

	return [
		chalk.bold('Rental model sunset'),
		'',
		`You have ${rentalActorCount} ${actorWord} published in Apify Store. Apify is sunsetting the rental pricing model.`,
		'The following changes are scheduled for 2026:',
		'',
		`  ${chalk.bold('April 1')}    You can no longer publish new rental Actors or change pricing on existing ones.`,
		`  ${chalk.bold('October 1')}  Rental Actors are fully retired. All remaining Actors are migrated to pay-per-usage pricing.`,
		'',
		`For more information, visit the ${chalk.cyan('#project-rentals')} channel on Apify Discord:`,
		`  ${chalk.cyan(APIFY_DISCORD_URL)}`,
		'',
	].join('\n');
}

/**
 * Reads the logged in username straight from auth.json instead of going through `getLocalUserInfo`,
 * which resolves the token from the OS keyring and would trigger a keychain prompt on commands that
 * do not need authentication at all.
 */
async function getLocalUsername() {
	try {
		const raw = await readFile(AUTH_FILE_PATH(), 'utf-8');

		return (JSON.parse(raw) as AuthJSON).username;
	} catch {
		return undefined;
	}
}

async function fetchRentalActorCount(username: string) {
	const metadata = useCLIMetadata();

	const url = new URL('/v2/store', process.env.APIFY_CLIENT_BASE_URL || DEFAULT_API_BASE_URL);
	url.searchParams.set('username', username);
	url.searchParams.set('pricingModel', RENTAL_PRICING_MODEL);
	// We only need the `total`, not the Actors themselves.
	url.searchParams.set('limit', '1');

	const res = await fetch(url, {
		headers: {
			'User-Agent': `Apify CLI/${metadata.version} (https://github.com/apify/apify-cli)`,
		},
		signal: AbortSignal.timeout(3_000),
	});

	if (!res.ok) {
		cliDebugPrint('useRentalSunsetNotice', 'Failed to fetch rental Actors', { statusCode: res.status });

		return null;
	}

	const body = (await res.json()) as { data?: { total?: number } };

	return body.data?.total ?? 0;
}

async function resolveRentalActorCount(state: LatestState, username: string, now: number) {
	const cached = state.rentalSunset;

	const cacheIsUsable =
		cached && cached.username === username && now - cached.lastChecked < CHECK_RENTAL_ACTORS_EVERY_MILLIS;

	if (cacheIsUsable) {
		return cached.rentalActorCount;
	}

	const rentalActorCount = await fetchRentalActorCount(username);

	if (rentalActorCount === null) {
		return cached?.username === username ? cached.rentalActorCount : null;
	}

	updateLocalState(state, (stateToUpdate) => {
		stateToUpdate.rentalSunset = {
			...stateToUpdate.rentalSunset,
			lastChecked: now,
			username,
			rentalActorCount,
		};
	});

	return rentalActorCount;
}

/**
 * Warns users who publish rental Actors in Apify Store that the rental pricing model is going away.
 * Runs after every command, but only prints once a day and only checks the API once a day.
 *
 * Never throws - a broken notice must not break the command the user actually asked for.
 */
export async function useRentalSunsetNotice() {
	try {
		const now = Date.now();
		const state = useLocalState();

		if (
			shouldSkipRentalSunsetNotice({
				now,
				isCi: isCI,
				skipEnvValue: process.env.APIFY_CLI_SKIP_RENTAL_SUNSET_NOTICE,
				lastNotifiedAt: state.rentalSunset?.lastNotifiedAt,
			})
		) {
			return;
		}

		const username = await getLocalUsername();

		if (!username) {
			cliDebugPrint('useRentalSunsetNotice', 'Not logged in, skipping the check');

			return;
		}

		const rentalActorCount = await resolveRentalActorCount(state, username, now);

		if (!rentalActorCount) {
			return;
		}

		const latestState = useLocalState();

		updateLocalState(latestState, (stateToUpdate) => {
			stateToUpdate.rentalSunset = {
				lastChecked: latestState.rentalSunset?.lastChecked ?? now,
				username,
				rentalActorCount,
				lastNotifiedAt: now,
			};
		});

		simpleLog({ message: '' });
		warning({ message: renderRentalSunsetNotice(rentalActorCount) });
	} catch (err) {
		cliDebugPrint('useRentalSunsetNotice', 'Failed to run the rental sunset check', err);
	}
}
