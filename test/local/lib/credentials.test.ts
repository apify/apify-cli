import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import process from 'node:process';

import { cryptoRandomObjectId } from '@apify/utilities';

import { __resetAuthFileForTests } from '../../../src/lib/auth-file.js';
import { getApifyClientOptions } from '../../../src/lib/auth.js';
import { AUTH_FILE_PATH, GLOBAL_CONFIGS_FOLDER } from '../../../src/lib/consts.js';
import {
	__resetCredentialsForTests,
	clearKeyringSecrets,
	ensureMigrated,
	getBackend,
	getProxyPassword,
	getToken,
	setProxyPassword,
	setToken,
} from '../../../src/lib/credentials.js';
import { getLocalUserInfo } from '../../../src/lib/utils.js';
import {
	KEYRING_PROXY_PASSWORD_KEY,
	KEYRING_TOKEN_KEY,
	keyringFailures,
	keyringSetKeys,
	keyringStore,
	resetKeyringMock,
} from '../../__setup__/keyring-mock.js';

vi.mock('@napi-rs/keyring', () => import('../../__setup__/keyring-mock.js'));

// A rewrite is byte-identical, so only a spy can tell a skipped write from a repeated one.
vi.mock('node:fs', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:fs')>();
	return { ...actual, writeFileSync: vi.fn(actual.writeFileSync) };
});

const writeFileSyncSpy = vi.mocked(writeFileSync);
// auth.json is written through a temp file and a rename, so the spied path carries a suffix.
const authFileWrites = () => writeFileSyncSpy.mock.calls.filter((call) => String(call[0]).startsWith(AUTH_FILE_PATH()));

const writeAuthFile = (data: Record<string, unknown>) => {
	mkdirSync(GLOBAL_CONFIGS_FOLDER(), { recursive: true });
	writeFileSync(AUTH_FILE_PATH(), JSON.stringify(data));
};

const readAuthFile = () => JSON.parse(readFileSync(AUTH_FILE_PATH(), 'utf-8'));

describe('credentials', () => {
	beforeEach(() => {
		vitest.stubEnv('__APIFY_INTERNAL_TEST_AUTH_PATH__', cryptoRandomObjectId(12));
		// The resolver reads APIFY_TOKEN, so a token in the developer's shell would leak into tests.
		vitest.stubEnv('APIFY_TOKEN', '');
		resetKeyringMock();
		writeFileSyncSpy.mockClear();
		__resetCredentialsForTests();
		__resetAuthFileForTests();
	});

	afterEach(async () => {
		await rm(GLOBAL_CONFIGS_FOLDER(), { recursive: true, force: true });
		vitest.unstubAllEnvs();
		__resetCredentialsForTests();
		__resetAuthFileForTests();
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

		it('returns "file" when auth.json carries the marker, even if the keyring loads', async () => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '');
			writeAuthFile({ token: 'tok', secretsBackend: 'file' });
			expect(await getBackend()).toBe('file');
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

		it('preserves other proxy fields when only the password changes', async () => {
			writeAuthFile({ proxy: { password: 'old', groups: [{ name: 'g' }] } } as never);
			await setProxyPassword('new');
			expect(readAuthFile().proxy).toEqual({ password: 'new', groups: [{ name: 'g' }] });
		});

		it('skipIfUnchanged skips the write when the stored token matches', async () => {
			await setToken('tok_123');
			writeFileSyncSpy.mockClear();
			await setToken('tok_123', { skipIfUnchanged: true });
			expect(authFileWrites()).toHaveLength(0);
		});

		it('skipIfUnchanged skips the write when the stored proxy password matches', async () => {
			await setProxyPassword('pw_abc');
			writeFileSyncSpy.mockClear();
			await setProxyPassword('pw_abc', { skipIfUnchanged: true });
			expect(authFileWrites()).toHaveLength(0);
		});

		it('skipIfUnchanged still writes when the value differs', async () => {
			await setToken('tok_123');
			writeFileSyncSpy.mockClear();
			await setToken('tok_456', { skipIfUnchanged: true });
			expect(authFileWrites()).toHaveLength(1);
			expect(await getToken()).toBe('tok_456');
		});

		it('writes auth.json with mode 0600', async () => {
			await setToken('tok_123');
			expect(writeFileSyncSpy).toHaveBeenCalledWith(expect.stringContaining(AUTH_FILE_PATH()), expect.any(String), {
				mode: 0o600,
			});
		});

		it.skipIf(process.platform === 'win32')('creates auth.json readable only by the owner', async () => {
			await setToken('tok_123');
			expect(statSync(AUTH_FILE_PATH()).mode & 0o777).toBe(0o600);
		});
	});

	describe('keyring backend', () => {
		beforeEach(() => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '');
		});

		it('round-trips the token through the keyring and keeps it out of auth.json', async () => {
			await setToken('tok_123');
			expect(await getToken()).toBe('tok_123');
			expect(keyringStore.get(KEYRING_TOKEN_KEY)).toBe('tok_123');
			expect(existsSync(AUTH_FILE_PATH())).toBe(false);
		});

		it('round-trips the proxy password through the keyring and keeps it out of auth.json', async () => {
			await setProxyPassword('pw_abc');
			expect(await getProxyPassword()).toBe('pw_abc');
			expect(keyringStore.get(KEYRING_PROXY_PASSWORD_KEY)).toBe('pw_abc');
			expect(existsSync(AUTH_FILE_PATH())).toBe(false);
		});

		it('clearKeyringSecrets() removes the token and proxy entries from the keyring', async () => {
			await setToken('tok_123');
			await setProxyPassword('pw_abc');
			await clearKeyringSecrets();
			expect(await getToken()).toBeUndefined();
			expect(await getProxyPassword()).toBeUndefined();
		});

		it('skipIfUnchanged skips the keyring write when the stored token matches', async () => {
			await setToken('tok_123');
			await setToken('tok_123', { skipIfUnchanged: true });
			expect(keyringSetKeys.filter((key) => key === KEYRING_TOKEN_KEY)).toHaveLength(1);
			expect(authFileWrites()).toHaveLength(0);
		});

		it('skipIfUnchanged skips the keyring write when the stored proxy password matches', async () => {
			await setProxyPassword('pw_abc');
			await setProxyPassword('pw_abc', { skipIfUnchanged: true });
			expect(keyringSetKeys.filter((key) => key === KEYRING_PROXY_PASSWORD_KEY)).toHaveLength(1);
			expect(authFileWrites()).toHaveLength(0);
		});

		it('falls back to auth.json when the keyring token write fails', async () => {
			keyringFailures.add(KEYRING_TOKEN_KEY);
			await setToken('tok_123');

			expect(keyringStore.get(KEYRING_TOKEN_KEY)).toBeUndefined();
			expect(readAuthFile()).toEqual({ token: 'tok_123', secretsBackend: 'file' });
			expect(await getBackend()).toBe('file');
			expect(await getToken()).toBe('tok_123');
		});

		it('keeps using auth.json for later writes after a keyring failure', async () => {
			keyringFailures.add(KEYRING_TOKEN_KEY);
			await setToken('tok_123');

			await setProxyPassword('pw_abc');
			expect(keyringStore.get(KEYRING_PROXY_PASSWORD_KEY)).toBeUndefined();
			expect(readAuthFile().proxy).toEqual({ password: 'pw_abc' });
		});

		it('falls back to auth.json when the keyring proxy password write fails', async () => {
			keyringFailures.add(KEYRING_PROXY_PASSWORD_KEY);
			await setProxyPassword('pw_abc');

			expect(keyringStore.get(KEYRING_PROXY_PASSWORD_KEY)).toBeUndefined();
			expect(readAuthFile()).toEqual({ proxy: { password: 'pw_abc' }, secretsBackend: 'file' });
			expect(await getProxyPassword()).toBe('pw_abc');
		});
	});

	describe('clearKeyringSecrets()', () => {
		it('clears the keyring token entry even when APIFY_DISABLE_KEYRING=1 is set at logout time', async () => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '');
			await setToken('tok_123');
			expect(keyringStore.get(KEYRING_TOKEN_KEY)).toBe('tok_123');

			__resetCredentialsForTests();
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '1');
			expect(await getBackend()).toBe('file');

			await clearKeyringSecrets();
			expect(keyringStore.get(KEYRING_TOKEN_KEY)).toBeUndefined();
		});
	});

	describe('ensureMigrated()', () => {
		it('is a no-op when secretsBackend marker is already set', async () => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '1');
			writeAuthFile({ token: 'tok', secretsBackend: 'file' });
			await ensureMigrated();
			expect(readAuthFile().token).toBe('tok');
		});

		it('is a no-op when the marker says keyring and secrets are still in auth.json', async () => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '');
			writeAuthFile({ token: 'tok', proxy: { password: 'pw' }, secretsBackend: 'keyring' });
			await ensureMigrated();
			expect(keyringStore.get(KEYRING_TOKEN_KEY)).toBeUndefined();
			expect(readAuthFile()).toEqual({ token: 'tok', proxy: { password: 'pw' }, secretsBackend: 'keyring' });
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

		it('on the keyring backend, moves the token and proxy password out of auth.json', async () => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '');
			writeAuthFile({ token: 'tok', proxy: { password: 'pw' }, username: 'u' });
			await ensureMigrated();
			expect(keyringStore.get(KEYRING_TOKEN_KEY)).toBe('tok');
			expect(keyringStore.get(KEYRING_PROXY_PASSWORD_KEY)).toBe('pw');
			const file = readAuthFile();
			expect(file.token).toBeUndefined();
			expect(file.proxy).toBeUndefined();
			expect(file.username).toBe('u');
			expect(file.secretsBackend).toBe('keyring');
		});

		it('on the keyring backend, strips only the proxy password and keeps other proxy fields', async () => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '');
			writeAuthFile({ token: 'tok', proxy: { password: 'pw', groups: [{ name: 'g' }] }, username: 'u' });
			await ensureMigrated();
			expect(keyringStore.get(KEYRING_PROXY_PASSWORD_KEY)).toBe('pw');
			const file = readAuthFile();
			expect(file.proxy).toEqual({ groups: [{ name: 'g' }] });
			expect(file.secretsBackend).toBe('keyring');
		});

		it('migrates proxy password to the keyring when token is absent', async () => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '');
			writeAuthFile({ proxy: { password: 'pw' }, username: 'u' });
			await ensureMigrated();
			expect(keyringStore.get(KEYRING_PROXY_PASSWORD_KEY)).toBe('pw');
			const file = readAuthFile();
			expect(file.proxy).toBeUndefined();
			expect(file.username).toBe('u');
			expect(file.secretsBackend).toBe('keyring');
		});

		it('stamps the file marker for a proxy-only state on the file backend', async () => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '1');
			writeAuthFile({ proxy: { password: 'pw' } });
			await ensureMigrated();
			const file = readAuthFile();
			expect(file.secretsBackend).toBe('file');
			expect(file.proxy?.password).toBe('pw');
		});

		it('falls back to file backend when the proxy keyring write fails after token succeeds', async () => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '');
			keyringFailures.add(KEYRING_PROXY_PASSWORD_KEY);
			writeAuthFile({ token: 'tok', proxy: { password: 'pw' }, username: 'u' });
			await ensureMigrated();
			const file = readAuthFile();
			expect(file.secretsBackend).toBe('file');
			expect(file.token).toBe('tok');
			expect(file.proxy?.password).toBe('pw');
			expect(file.username).toBe('u');
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

	describe('getLocalUserInfo()', () => {
		it('on file backend, keeps the proxy password and drops the groups nothing reads', async () => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '1');
			writeAuthFile({
				username: 'me',
				id: 'uid',
				token: 'tok',
				proxy: { password: 'pw', groups: [{ name: 'g' }] },
				secretsBackend: 'file',
			});
			const info = await getLocalUserInfo();
			expect(info.proxy).toEqual({ password: 'pw' });
		});

		it('on keyring backend, overlays token and proxy password from keyring', async () => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '');
			keyringStore.set(KEYRING_TOKEN_KEY, 'tok_kr');
			keyringStore.set(KEYRING_PROXY_PASSWORD_KEY, 'pw_kr');
			writeAuthFile({ username: 'me', id: 'uid', secretsBackend: 'keyring' });
			const info = await getLocalUserInfo();
			expect(info.token).toBe('tok_kr');
			expect(info.proxy?.password).toBe('pw_kr');
		});

		it('returns an empty object when nothing is stored', async () => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '1');
			expect(await getLocalUserInfo()).toEqual({});
		});

		it('on file backend, throws when a token is stored without user metadata', async () => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '1');
			writeAuthFile({ token: 'tok', secretsBackend: 'file' });
			await expect(getLocalUserInfo()).rejects.toThrow('Stale credentials found without user metadata');
		});

		it('on keyring backend, throws when the keyring holds a token but auth.json is gone', async () => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '');
			keyringStore.set(KEYRING_TOKEN_KEY, 'tok_kr');
			await expect(getLocalUserInfo()).rejects.toThrow('Stale credentials found without user metadata');
		});
	});

	describe('getApifyClientOptions()', () => {
		beforeEach(() => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '1');
		});

		it('resolves the stored token when nothing overrides it', async () => {
			await setToken('tok_stored');
			expect((await getApifyClientOptions()).token).toBe('tok_stored');
		});

		it('prefers an explicitly passed token over the stored one', async () => {
			await setToken('tok_stored');
			expect((await getApifyClientOptions('tok_explicit')).token).toBe('tok_explicit');
		});

		it('resolves a pre-migration auth.json and stamps the backend marker', async () => {
			writeAuthFile({ username: 'me', id: 'uid', token: 'tok_legacy' });
			expect((await getApifyClientOptions()).token).toBe('tok_legacy');
			expect(readAuthFile().secretsBackend).toBe('file');
		});

		it('resolves to undefined when no token is stored', async () => {
			expect((await getApifyClientOptions()).token).toBeUndefined();
		});
	});
});
