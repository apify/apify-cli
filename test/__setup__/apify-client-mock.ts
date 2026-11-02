/**
 * Stand-in for `apify-client`, so the auth flow runs under `test:local` with no network.
 *
 * Install it per file, keeping the real module's other exports — `ApifyApiError` in particular,
 * which `describeAuthFailure` narrows on:
 *
 * ```ts
 * vi.mock('apify-client', async (importOriginal) => ({
 *   ...(await importOriginal<typeof import('apify-client')>()),
 *   ApifyClient: (await import('../../__setup__/apify-client-mock.js')).FakeApifyClient,
 * }));
 * ```
 */
export const clientState = {
	user: {} as Record<string, unknown>,
	fail: false,
	failWith: undefined as unknown,
};

export function resetApifyClientMock(user: Record<string, unknown>) {
	clientState.user = user;
	clientState.fail = false;
	clientState.failWith = undefined;
}

export class FakeApifyClient {
	token?: string;

	constructor(options: { token?: string }) {
		this.token = options.token;
	}

	user() {
		return {
			get: async () => {
				if (clientState.fail) throw clientState.failWith ?? new Error('401');
				return clientState.user;
			},
		};
	}
}
