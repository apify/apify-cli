/**
 * Fake `@napi-rs/keyring` for tests. Install it with
 * `vi.mock('@napi-rs/keyring', () => import('<path>/keyring-mock.js'))` and import the
 * state below normally — the factory's dynamic import resolves to the same module instance.
 */

export const KEYRING_TOKEN_KEY = 'com.apify.cli:token';
export const KEYRING_PROXY_PASSWORD_KEY = 'com.apify.cli:proxy-password';

/** Stored secrets, keyed `${service}:${account}`. */
export const keyringStore = new Map<string, string>();

/** Keys for which `setPassword` throws, so the file fallback can be exercised. */
export const keyringFailures = new Set<string>();

/** Keys of successful writes, in order. Lets tests count how often a secret was actually written. */
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
