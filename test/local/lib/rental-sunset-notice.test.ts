import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { useAuthSetup } from '../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';

vitest.mock('ci-info', () => {
	const ciInfo = { isCI: false, GITHUB_ACTIONS: false, id: undefined };

	return { ...ciInfo, default: ciInfo };
});

const { AUTH_FILE_PATH, RENTAL_SUNSET_NOTICE_UNTIL, STATE_FILE_PATH } = await import('../../../src/lib/consts.js');
const { renderRentalSunsetNotice, shouldSkipRentalSunsetNotice, useRentalSunsetNotice } =
	await import('../../../src/lib/hooks/useRentalSunsetNotice.js');

const now = new Date('2026-05-01T00:00:00.000Z').getTime();
const day = 24 * 60 * 60 * 1000;

useAuthSetup();

const { logMessages } = useConsoleSpy();

async function writeAuthFile(username: string | undefined) {
	const path = AUTH_FILE_PATH();

	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, JSON.stringify({ id: 'user-id', username, token: 'apify_api_token' }));
}

async function readState() {
	return JSON.parse(await readFile(STATE_FILE_PATH(), 'utf-8')) as {
		rentalSunset?: { lastChecked: number; username?: string; rentalActorCount: number; lastNotifiedAt?: number };
	};
}

function mockStoreResponse(total: number) {
	return vitest.spyOn(globalThis, 'fetch').mockImplementation(async () =>
		Promise.resolve(
			new Response(JSON.stringify({ data: { total, count: total ? 1 : 0, items: [] } }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			}),
		),
	);
}

beforeEach(() => {
	// The suite-wide opt-out (see vitest.config.ts) keeps the rest of the tests from hitting the API,
	// but this file is the one place that actually exercises the notice.
	vitest.stubEnv('APIFY_CLI_SKIP_RENTAL_SUNSET_NOTICE', '');
	vitest.useFakeTimers({ toFake: ['Date'] });
	vitest.setSystemTime(now);
});

afterEach(() => {
	vitest.useRealTimers();
	vitest.restoreAllMocks();
});

describe('shouldSkipRentalSunsetNotice', () => {
	it('does not skip for a regular interactive run', () => {
		expect(shouldSkipRentalSunsetNotice({ now, isCi: false })).toBe(false);
	});

	it('skips when the opt-out env var is set', () => {
		expect(shouldSkipRentalSunsetNotice({ now, isCi: false, skipEnvValue: '1' })).toBe(true);
		expect(shouldSkipRentalSunsetNotice({ now, isCi: false, skipEnvValue: 'false' })).toBe(false);
		expect(shouldSkipRentalSunsetNotice({ now, isCi: false, skipEnvValue: '0' })).toBe(false);
	});

	it('skips in CI', () => {
		expect(shouldSkipRentalSunsetNotice({ now, isCi: true })).toBe(true);
	});

	it('skips once rental Actors are retired', () => {
		expect(shouldSkipRentalSunsetNotice({ now: RENTAL_SUNSET_NOTICE_UNTIL, isCi: false })).toBe(true);
	});

	it('skips when the user was already notified within the last day', () => {
		expect(shouldSkipRentalSunsetNotice({ now, isCi: false, lastNotifiedAt: now - 1000 })).toBe(true);
		expect(shouldSkipRentalSunsetNotice({ now, isCi: false, lastNotifiedAt: now - day - 1000 })).toBe(false);
	});
});

describe('renderRentalSunsetNotice', () => {
	it('mentions both milestones and where to ask questions', () => {
		const message = renderRentalSunsetNotice(3);

		expect(message).toContain('You have 3 rental Actors published in Apify Store');
		expect(message).toContain('April 1');
		expect(message).toContain('October 1');
		expect(message).toContain('#project-rentals');
	});

	it('uses singular wording for a single Actor', () => {
		expect(renderRentalSunsetNotice(1)).toContain('You have 1 rental Actor published');
	});
});

describe('useRentalSunsetNotice', () => {
	it('warns users who have rental Actors in the store and caches the result', async () => {
		await writeAuthFile('some-user');
		const fetchSpy = mockStoreResponse(2);

		await useRentalSunsetNotice();

		expect(fetchSpy).toHaveBeenCalledTimes(1);

		const requestedUrl = String(fetchSpy.mock.calls[0][0]);
		expect(requestedUrl).toContain('username=some-user');
		expect(requestedUrl).toContain('pricingModel=FLAT_PRICE_PER_MONTH');

		expect(logMessages.error.join('\n')).toContain('Rental model sunset');

		expect(await readState()).toMatchObject({
			rentalSunset: { username: 'some-user', rentalActorCount: 2, lastChecked: now, lastNotifiedAt: now },
		});
	});

	it('stays quiet for users without rental Actors', async () => {
		await writeAuthFile('some-user');
		mockStoreResponse(0);

		await useRentalSunsetNotice();

		expect(logMessages.error.join('\n')).not.toContain('Rental model sunset');
	});

	it('does not print again within a day, and does not hit the API either', async () => {
		await writeAuthFile('some-user');
		const fetchSpy = mockStoreResponse(2);

		await useRentalSunsetNotice();
		logMessages.error = [];

		vitest.setSystemTime(now + day / 2);
		await useRentalSunsetNotice();

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(logMessages.error.join('\n')).not.toContain('Rental model sunset');
	});

	it('warns again a day later, using the cached count', async () => {
		await writeAuthFile('some-user');
		const fetchSpy = mockStoreResponse(2);

		await useRentalSunsetNotice();
		logMessages.error = [];

		vitest.setSystemTime(now + day + 1000);
		await useRentalSunsetNotice();

		expect(fetchSpy).toHaveBeenCalledTimes(2);
		expect(logMessages.error.join('\n')).toContain('Rental model sunset');
	});

	it('does nothing when the user is not logged in', async () => {
		const fetchSpy = mockStoreResponse(2);

		await useRentalSunsetNotice();

		expect(fetchSpy).not.toHaveBeenCalled();
		expect(logMessages.error.join('\n')).not.toContain('Rental model sunset');
	});

	it('stays quiet when the API call fails', async () => {
		await writeAuthFile('some-user');
		vitest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network is down'));

		await expect(useRentalSunsetNotice()).resolves.toBeUndefined();

		expect(logMessages.error.join('\n')).not.toContain('Rental model sunset');
	});
});
