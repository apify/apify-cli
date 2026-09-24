/**
 * Fake `@napi-rs/keyring`. Install with
 * `vi.mock('@napi-rs/keyring', () => import('<path>/keyring-mock.js'))`.
 */

/** The fixed names secrets shared before they were keyed by user. */
export const LEGACY_KEYRING_TOKEN_KEY = 'com.apify.cli:token';
export const LEGACY_KEYRING_PROXY_PASSWORD_KEY = 'com.apify.cli:proxy-password';

/**
 * One service per kind, the user ID as the account. Spelled out here rather than imported so the
 * test fails when the production key scheme changes without anyone meaning to change it.
 */
export const keyringTokenKey = (userId: string) => `com.apify.cli.token:${userId}`;
export const keyringProxyPasswordKey = (userId: string) => `com.apify.cli.proxy-password:${userId}`;

export const keyringStore = new Map<string, string>();

export const keyringFailures = new Set<string>();

export const keyringSetKeys: string[] = [];

export class Entry {
	private key: string;

	constructor(service: string, account: string) {
		this.key = `${service}:${account}`;
	}

	getPassword(): string | null {
		return keyringStore.get(this.key) ?? null;
	}

	setPassword(password: string): void {
		if (keyringFailures.has(this.key)) throw new Error('simulated keyring failure');
		keyringStore.set(this.key, password);
		keyringSetKeys.push(this.key);
	}

	deletePassword(): boolean {
		return keyringStore.delete(this.key);
	}
}

export function resetKeyringMock() {
	keyringStore.clear();
	keyringFailures.clear();
	keyringSetKeys.length = 0;
}
