import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';

import { cryptoRandomObjectId } from '@apify/utilities';

import { AUTH_FILE_PATH, GLOBAL_CONFIGS_FOLDER } from '../../../src/lib/consts.js';
import {
	__resetCredentialsForTests,
	clearSecrets,
	ensureMigrated,
	getBackend,
	getProxyPassword,
	getToken,
	setProxyPassword,
	setToken,
} from '../../../src/lib/credentials.js';

const keyringStore = new Map<string, string>();

vi.mock('@napi-rs/keyring', () => {
	class Entry {
		private key: string;
		constructor(service: string, account: string) {
			this.key = `${service}:${account}`;
		}
		getPassword(): string | null {
			return keyringStore.get(this.key) ?? null;
		}
		setPassword(password: string): void {
			keyringStore.set(this.key, password);
		}
		deletePassword(): boolean {
			return keyringStore.delete(this.key);
		}
	}
	return { Entry };
});

const writeAuthFile = (data: Record<string, unknown>) => {
	mkdirSync(GLOBAL_CONFIGS_FOLDER(), { recursive: true });
	writeFileSync(AUTH_FILE_PATH(), JSON.stringify(data));
};

const readAuthFile = () => JSON.parse(readFileSync(AUTH_FILE_PATH(), 'utf-8'));

describe('credentials', () => {
	beforeEach(() => {
		vitest.stubEnv('__APIFY_INTERNAL_TEST_AUTH_PATH__', cryptoRandomObjectId(12));
		keyringStore.clear();
		__resetCredentialsForTests();
	});

	afterEach(async () => {
		await rm(GLOBAL_CONFIGS_FOLDER(), { recursive: true, force: true });
		vitest.unstubAllEnvs();
		__resetCredentialsForTests();
	});

	describe('getBackend()', () => {
		it('returns "file" when APIFY_DISABLE_KEYRING=1', async () => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '1');
			expect(await getBackend()).toBe('file');
		});

		it('returns "keyring" when the keyring probe succeeds', async () => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '');
			expect(await getBackend()).toBe('keyring');
		});

		it('caches the backend choice for the rest of the process', async () => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '1');
			expect(await getBackend()).toBe('file');
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '');
			expect(await getBackend()).toBe('file');
		});
	});

	describe('file backend', () => {
		beforeEach(() => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '1');
		});

		it('round-trips the token through auth.json', async () => {
			await setToken('tok_123');
			expect(await getToken()).toBe('tok_123');
			const file = readAuthFile();
			expect(file.token).toBe('tok_123');
			expect(file.secretsBackend).toBe('file');
		});

		it('round-trips the proxy password through auth.json', async () => {
			await setProxyPassword('pw_abc');
			expect(await getProxyPassword()).toBe('pw_abc');
			expect(readAuthFile().proxy).toEqual({ password: 'pw_abc' });
		});

		it('skipIfUnchanged is a no-op when the stored value matches', async () => {
			await setToken('tok_123');
			const before = readFileSync(AUTH_FILE_PATH(), 'utf-8');
			await setToken('tok_123', { skipIfUnchanged: true });
			const after = readFileSync(AUTH_FILE_PATH(), 'utf-8');
			expect(after).toBe(before);
		});

		it('skipIfUnchanged still writes when the value differs', async () => {
			await setToken('tok_123');
			await setToken('tok_456', { skipIfUnchanged: true });
			expect(await getToken()).toBe('tok_456');
		});
	});

	describe('keyring backend', () => {
		beforeEach(() => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '');
		});

		it('round-trips the token through the keyring and keeps it out of auth.json', async () => {
			await setToken('tok_123');
			expect(await getToken()).toBe('tok_123');
			expect(keyringStore.get('com.apify.cli:token')).toBe('tok_123');
			expect(existsSync(AUTH_FILE_PATH())).toBe(false);
		});

		it('round-trips the proxy password through the keyring', async () => {
			await setProxyPassword('pw_abc');
			expect(await getProxyPassword()).toBe('pw_abc');
			expect(keyringStore.get('com.apify.cli:proxy-password')).toBe('pw_abc');
		});

		it('clearSecrets() removes both entries', async () => {
			await setToken('tok_123');
			await setProxyPassword('pw_abc');
			await clearSecrets();
			expect(await getToken()).toBeUndefined();
			expect(await getProxyPassword()).toBeUndefined();
		});
	});

	describe('ensureMigrated()', () => {
		it('is a no-op when secretsBackend marker is already set', async () => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '1');
			writeAuthFile({ token: 'tok', secretsBackend: 'file' });
			await ensureMigrated();
			expect(readAuthFile().token).toBe('tok');
		});

		it('is a no-op when there are no secrets to migrate', async () => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '1');
			await ensureMigrated();
			expect(existsSync(AUTH_FILE_PATH())).toBe(false);
		});

		it('on the file backend, stamps the marker without moving data', async () => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '1');
			writeAuthFile({ token: 'tok', username: 'u' });
			await ensureMigrated();
			const file = readAuthFile();
			expect(file.token).toBe('tok');
			expect(file.username).toBe('u');
			expect(file.secretsBackend).toBe('file');
		});

		it('on the keyring backend, moves secrets out of auth.json', async () => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '');
			writeAuthFile({ token: 'tok', proxy: { password: 'pw' }, username: 'u' });
			await ensureMigrated();
			expect(keyringStore.get('com.apify.cli:token')).toBe('tok');
			expect(keyringStore.get('com.apify.cli:proxy-password')).toBe('pw');
			const file = readAuthFile();
			expect(file.token).toBeUndefined();
			expect(file.proxy).toBeUndefined();
			expect(file.username).toBe('u');
			expect(file.secretsBackend).toBe('keyring');
		});

		it('is memoized within a process', async () => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '1');
			writeAuthFile({ token: 'tok' });
			await ensureMigrated();
			expect(readAuthFile().secretsBackend).toBe('file');

			// Overwrite the marker and call again — the memoized promise should short-circuit.
			writeAuthFile({ token: 'tok2' });
			await ensureMigrated();
			expect(readAuthFile().secretsBackend).toBeUndefined();
		});
	});
});
