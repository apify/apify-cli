import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import process from 'node:process';

import { cryptoRandomObjectId } from '@apify/utilities';

import { __resetAuthFileForTests } from '../../../src/lib/auth-file.js';
import { resolveAuth } from '../../../src/lib/auth.js';
import { AUTH_FILE_PATH, GLOBAL_CONFIGS_FOLDER } from '../../../src/lib/consts.js';
import {
	__resetCredentialsForTests,
	clearKeyringSecrets,
	deleteSecret,
	ensureMigrated,
	ensureSecretsKeyed,
	getBackend,
	getSecret,
	setSecret,
} from '../../../src/lib/credentials.js';
import { getLocalUserInfo } from '../../../src/lib/utils.js';
import { TEST_USER_ID, v2AuthFile } from '../../__setup__/auth-file.js';
import {
	LEGACY_KEYRING_PROXY_PASSWORD_KEY,
	LEGACY_KEYRING_TOKEN_KEY,
	keyringFailures,
	keyringProxyPasswordKey,
	keyringSetKeys,
	keyringStore,
	keyringTokenKey,
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

const readProfile = () => readAuthFile().profiles[TEST_USER_ID];

const writeV2AuthFile = (...args: Parameters<typeof v2AuthFile>) =>
	writeAuthFile(v2AuthFile(...args) as Record<string, unknown>);

const TOKEN_KEY = keyringTokenKey(TEST_USER_ID);
const PROXY_PASSWORD_KEY = keyringProxyPasswordKey(TEST_USER_ID);

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
			writeV2AuthFile();
			writeFileSyncSpy.mockClear();
		});

		it('round-trips the token through the profile', async () => {
			await setSecret(TEST_USER_ID, 'token', 'tok_123');
			expect(await getSecret(TEST_USER_ID, 'token')).toBe('tok_123');
			expect(readProfile().token).toBe('tok_123');
			expect(readAuthFile().token).toBeUndefined();
			expect(readAuthFile().secretsBackend).toBe('file');
		});

		it('round-trips the proxy password through the profile', async () => {
			await setSecret(TEST_USER_ID, 'proxy-password', 'pw_abc');
			expect(await getSecret(TEST_USER_ID, 'proxy-password')).toBe('pw_abc');
			expect(readProfile().proxy).toEqual({ password: 'pw_abc' });
		});

		it('deleteSecret() forgets the proxy password and leaves the token alone', async () => {
			await setSecret(TEST_USER_ID, 'token', 'tok_123');
			await setSecret(TEST_USER_ID, 'proxy-password', 'pw_abc');

			await deleteSecret(TEST_USER_ID, 'proxy-password');

			expect(readProfile().proxy).toBeUndefined();
			expect(readProfile().token).toBe('tok_123');
		});

		it('leaves another profile alone', async () => {
			const file = v2AuthFile();
			file.profiles!.other = { ...file.profiles![TEST_USER_ID], token: 'tok_other' };
			writeAuthFile(file as Record<string, unknown>);

			await setSecret(TEST_USER_ID, 'token', 'tok_123');
			expect(readAuthFile().profiles.other.token).toBe('tok_other');
		});

		it('does nothing when the profile is not in the file', async () => {
			writeAuthFile({ version: 2, activeProfile: 'gone', profiles: {} });
			await setSecret('gone', 'token', 'tok_123');
			expect(await getSecret('gone', 'token')).toBeUndefined();
		});

		it('skipIfUnchanged skips the write when the stored token matches', async () => {
			await setSecret(TEST_USER_ID, 'token', 'tok_123');
			writeFileSyncSpy.mockClear();
			await setSecret(TEST_USER_ID, 'token', 'tok_123', { skipIfUnchanged: true });
			expect(authFileWrites()).toHaveLength(0);
		});

		it('skipIfUnchanged skips the write when the stored proxy password matches', async () => {
			await setSecret(TEST_USER_ID, 'proxy-password', 'pw_abc');
			writeFileSyncSpy.mockClear();
			await setSecret(TEST_USER_ID, 'proxy-password', 'pw_abc', { skipIfUnchanged: true });
			expect(authFileWrites()).toHaveLength(0);
		});

		it('skipIfUnchanged still writes when the value differs', async () => {
			await setSecret(TEST_USER_ID, 'token', 'tok_123');
			writeFileSyncSpy.mockClear();
			await setSecret(TEST_USER_ID, 'token', 'tok_456', { skipIfUnchanged: true });
			expect(authFileWrites()).toHaveLength(1);
			expect(await getSecret(TEST_USER_ID, 'token')).toBe('tok_456');
		});

		it('writes auth.json with mode 0600', async () => {
			await setSecret(TEST_USER_ID, 'token', 'tok_123');
			expect(writeFileSyncSpy).toHaveBeenCalledWith(expect.stringContaining(AUTH_FILE_PATH()), expect.any(String), {
				mode: 0o600,
			});
		});

		it.skipIf(process.platform === 'win32')('creates auth.json readable only by the owner', async () => {
			await setSecret(TEST_USER_ID, 'token', 'tok_123');
			expect(statSync(AUTH_FILE_PATH()).mode & 0o777).toBe(0o600);
		});
	});

	describe('keyring backend', () => {
		beforeEach(() => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '');
		});

		it('keys the token by user ID and keeps it out of auth.json', async () => {
			await setSecret(TEST_USER_ID, 'token', 'tok_123');
			expect(await getSecret(TEST_USER_ID, 'token')).toBe('tok_123');
			expect(keyringStore.get(TOKEN_KEY)).toBe('tok_123');
			expect(keyringStore.get(LEGACY_KEYRING_TOKEN_KEY)).toBeUndefined();
			expect(existsSync(AUTH_FILE_PATH())).toBe(false);
		});

		it('keys the proxy password by user ID and keeps it out of auth.json', async () => {
			await setSecret(TEST_USER_ID, 'proxy-password', 'pw_abc');
			expect(await getSecret(TEST_USER_ID, 'proxy-password')).toBe('pw_abc');
			expect(keyringStore.get(PROXY_PASSWORD_KEY)).toBe('pw_abc');
			expect(existsSync(AUTH_FILE_PATH())).toBe(false);
		});

		it('gives two accounts their own entries', async () => {
			await setSecret(TEST_USER_ID, 'token', 'tok_123');
			await setSecret('other', 'token', 'tok_other');
			expect(keyringStore.get(TOKEN_KEY)).toBe('tok_123');
			expect(keyringStore.get(keyringTokenKey('other'))).toBe('tok_other');
		});

		it('deleteSecret() removes only that account and kind', async () => {
			await setSecret(TEST_USER_ID, 'proxy-password', 'pw_abc');
			await setSecret('other', 'proxy-password', 'pw_other');

			await deleteSecret(TEST_USER_ID, 'proxy-password');

			expect(keyringStore.get(PROXY_PASSWORD_KEY)).toBeUndefined();
			expect(keyringStore.get(keyringProxyPasswordKey('other'))).toBe('pw_other');
		});

		it('skipIfUnchanged skips the keyring write when the stored token matches', async () => {
			await setSecret(TEST_USER_ID, 'token', 'tok_123');
			await setSecret(TEST_USER_ID, 'token', 'tok_123', { skipIfUnchanged: true });
			expect(keyringSetKeys.filter((key) => key === TOKEN_KEY)).toHaveLength(1);
			expect(authFileWrites()).toHaveLength(0);
		});

		it('skipIfUnchanged skips the keyring write when the stored proxy password matches', async () => {
			await setSecret(TEST_USER_ID, 'proxy-password', 'pw_abc');
			await setSecret(TEST_USER_ID, 'proxy-password', 'pw_abc', { skipIfUnchanged: true });
			expect(keyringSetKeys.filter((key) => key === PROXY_PASSWORD_KEY)).toHaveLength(1);
			expect(authFileWrites()).toHaveLength(0);
		});

		it('falls back to the profile when the keyring token write fails', async () => {
			writeV2AuthFile();
			keyringFailures.add(TOKEN_KEY);
			await setSecret(TEST_USER_ID, 'token', 'tok_123');

			expect(keyringStore.get(TOKEN_KEY)).toBeUndefined();
			expect(readProfile().token).toBe('tok_123');
			expect(readAuthFile().secretsBackend).toBe('file');
			expect(await getBackend()).toBe('file');
			expect(await getSecret(TEST_USER_ID, 'token')).toBe('tok_123');
		});

		it('keeps using auth.json for later writes after a keyring failure', async () => {
			writeV2AuthFile();
			keyringFailures.add(TOKEN_KEY);
			await setSecret(TEST_USER_ID, 'token', 'tok_123');

			await setSecret(TEST_USER_ID, 'proxy-password', 'pw_abc');
			expect(keyringStore.get(PROXY_PASSWORD_KEY)).toBeUndefined();
			expect(readProfile().proxy).toEqual({ password: 'pw_abc' });
		});

		it('falls back to the profile when the keyring proxy password write fails', async () => {
			writeV2AuthFile();
			keyringFailures.add(PROXY_PASSWORD_KEY);
			await setSecret(TEST_USER_ID, 'proxy-password', 'pw_abc');

			expect(keyringStore.get(PROXY_PASSWORD_KEY)).toBeUndefined();
			expect(readProfile().proxy).toEqual({ password: 'pw_abc' });
			expect(await getSecret(TEST_USER_ID, 'proxy-password')).toBe('pw_abc');
		});
	});

	describe('clearKeyringSecrets()', () => {
		beforeEach(() => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '');
		});

		it('removes the profile entries and the fixed-name ones left from before', async () => {
			keyringStore.set(LEGACY_KEYRING_TOKEN_KEY, 'tok_old');
			keyringStore.set(LEGACY_KEYRING_PROXY_PASSWORD_KEY, 'pw_old');
			await setSecret(TEST_USER_ID, 'token', 'tok_123');
			await setSecret(TEST_USER_ID, 'proxy-password', 'pw_abc');

			await clearKeyringSecrets(TEST_USER_ID);

			expect(keyringStore.size).toBe(0);
		});

		it('leaves other profiles alone', async () => {
			await setSecret(TEST_USER_ID, 'token', 'tok_123');
			await setSecret('other', 'token', 'tok_other');

			await clearKeyringSecrets(TEST_USER_ID);

			expect(keyringStore.get(TOKEN_KEY)).toBeUndefined();
			expect(keyringStore.get(keyringTokenKey('other'))).toBe('tok_other');
		});

		it('clears the keyring entries even when APIFY_DISABLE_KEYRING=1 is set at logout time', async () => {
			await setSecret(TEST_USER_ID, 'token', 'tok_123');
			expect(keyringStore.get(TOKEN_KEY)).toBe('tok_123');

			__resetCredentialsForTests();
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '1');
			expect(await getBackend()).toBe('file');

			await clearKeyringSecrets(TEST_USER_ID);
			expect(keyringStore.get(TOKEN_KEY)).toBeUndefined();
		});
	});

	describe('ensureMigrated()', () => {
		it('runs when resolveAuth reads a pre-migration auth.json', async () => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '1');
			writeAuthFile({ username: 'me', id: 'uid', token: 'tok_legacy' });

			expect((await resolveAuth())?.token).toBe('tok_legacy');
			expect(readAuthFile().secretsBackend).toBe('file');
		});

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
			expect(keyringStore.get(LEGACY_KEYRING_TOKEN_KEY)).toBeUndefined();
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
			expect(keyringStore.get(LEGACY_KEYRING_TOKEN_KEY)).toBe('tok');
			expect(keyringStore.get(LEGACY_KEYRING_PROXY_PASSWORD_KEY)).toBe('pw');
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
			expect(keyringStore.get(LEGACY_KEYRING_PROXY_PASSWORD_KEY)).toBe('pw');
			const file = readAuthFile();
			expect(file.proxy).toEqual({ groups: [{ name: 'g' }] });
			expect(file.secretsBackend).toBe('keyring');
		});

		it('migrates proxy password to the keyring when token is absent', async () => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '');
			writeAuthFile({ proxy: { password: 'pw' }, username: 'u' });
			await ensureMigrated();
			expect(keyringStore.get(LEGACY_KEYRING_PROXY_PASSWORD_KEY)).toBe('pw');
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
			keyringFailures.add(LEGACY_KEYRING_PROXY_PASSWORD_KEY);
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

	describe('ensureSecretsKeyed()', () => {
		it('moves keyring entries off the fixed names onto the user ID', async () => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '');
			writeV2AuthFile({}, { secretsBackend: 'keyring' });
			keyringStore.set(LEGACY_KEYRING_TOKEN_KEY, 'tok');
			keyringStore.set(LEGACY_KEYRING_PROXY_PASSWORD_KEY, 'pw');

			await ensureSecretsKeyed();

			expect(keyringStore.get(TOKEN_KEY)).toBe('tok');
			expect(keyringStore.get(PROXY_PASSWORD_KEY)).toBe('pw');
			expect(keyringStore.get(LEGACY_KEYRING_TOKEN_KEY)).toBeUndefined();
			expect(keyringStore.get(LEGACY_KEYRING_PROXY_PASSWORD_KEY)).toBeUndefined();
		});

		it('moves top-level file secrets into the profile', async () => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '1');
			writeV2AuthFile({}, { secretsBackend: 'file', token: 'tok', proxy: { password: 'pw' } });

			await ensureSecretsKeyed();

			expect(readProfile()).toMatchObject({ token: 'tok', proxy: { password: 'pw' } });
			const file = readAuthFile();
			expect(file.token).toBeUndefined();
			expect(file.proxy).toBeUndefined();
			expect(file.secretsBackend).toBe('file');
		});

		it('drops secrets it has no user ID to file under', async () => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '');
			writeAuthFile({ version: 2, profiles: {}, secretsBackend: 'keyring', token: 'tok' });
			keyringStore.set(LEGACY_KEYRING_TOKEN_KEY, 'tok_kr');

			await ensureSecretsKeyed();

			expect(readAuthFile().token).toBeUndefined();
			expect(keyringStore.get(LEGACY_KEYRING_TOKEN_KEY)).toBeUndefined();
		});

		it('drops the legacy entries even under APIFY_DISABLE_KEYRING=1', async () => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '1');
			writeAuthFile({ version: 2, profiles: {}, secretsBackend: 'keyring' });
			keyringStore.set(LEGACY_KEYRING_TOKEN_KEY, 'tok_kr');

			await ensureSecretsKeyed();

			expect(keyringStore.get(LEGACY_KEYRING_TOKEN_KEY)).toBeUndefined();
		});

		it('is a no-op on a file whose secrets are already keyed', async () => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '1');
			writeV2AuthFile({ token: 'tok' }, { secretsBackend: 'file' });
			writeFileSyncSpy.mockClear();

			await ensureSecretsKeyed();

			expect(authFileWrites()).toHaveLength(0);
			expect(readProfile().token).toBe('tok');
		});

		it('is a no-op on a file the shape migration has not reached', async () => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '1');
			writeAuthFile({ id: 'uid', token: 'tok' });
			writeFileSyncSpy.mockClear();

			await ensureSecretsKeyed();

			expect(authFileWrites()).toHaveLength(0);
			expect(readAuthFile().token).toBe('tok');
		});

		it('downgrades to the file backend when the keyring write fails mid-migration', async () => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '');
			writeV2AuthFile({}, { secretsBackend: 'keyring' });
			keyringStore.set(LEGACY_KEYRING_TOKEN_KEY, 'tok');
			keyringStore.set(LEGACY_KEYRING_PROXY_PASSWORD_KEY, 'pw');
			keyringFailures.add(TOKEN_KEY);

			await ensureSecretsKeyed();

			// Both secrets land in the file: the downgrade holds for the rest of the loop.
			expect(readProfile()).toMatchObject({ token: 'tok', proxy: { password: 'pw' } });
			expect(readAuthFile().secretsBackend).toBe('file');
			expect(await getBackend()).toBe('file');
			expect(keyringStore.size).toBe(0);
		});

		it('is memoized within a process', async () => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '1');
			writeV2AuthFile({}, { secretsBackend: 'file', token: 'tok' });
			await ensureSecretsKeyed();
			expect(readProfile().token).toBe('tok');

			writeV2AuthFile({}, { secretsBackend: 'file', token: 'tok2' });
			await ensureSecretsKeyed();
			expect(readAuthFile().token).toBe('tok2');
		});
	});

	describe('getLocalUserInfo()', () => {
		it('on file backend, reads the token and proxy password from the profile', async () => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '1');
			writeV2AuthFile({ token: 'tok', proxy: { password: 'pw' } }, { secretsBackend: 'file' });

			const info = await getLocalUserInfo();
			expect(info.token).toBe('tok');
			expect(info.proxy).toEqual({ password: 'pw' });
		});

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
			keyringStore.set(LEGACY_KEYRING_TOKEN_KEY, 'tok_kr');
			keyringStore.set(LEGACY_KEYRING_PROXY_PASSWORD_KEY, 'pw_kr');
			writeAuthFile({ username: 'me', id: 'uid', secretsBackend: 'keyring' });
			const info = await getLocalUserInfo();
			expect(info.token).toBe('tok_kr');
			expect(info.proxy?.password).toBe('pw_kr');
		});

		it('returns an empty object when nothing is stored', async () => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '1');
			expect(await getLocalUserInfo()).toEqual({});
		});

		it('on file backend, reports logged out for a token stored without user metadata', async () => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '1');
			writeAuthFile({ token: 'tok', secretsBackend: 'file' });

			expect(await getLocalUserInfo()).toEqual({});
			// The secret is dropped rather than left unreachable, so the next command asks for a login.
			expect(readAuthFile().token).toBeUndefined();
		});

		it('on keyring backend, reports logged out when the keyring holds a token but auth.json is gone', async () => {
			vitest.stubEnv('APIFY_DISABLE_KEYRING', '');
			keyringStore.set(LEGACY_KEYRING_TOKEN_KEY, 'tok_kr');

			expect(await getLocalUserInfo()).toEqual({});
			// auth.json is the only index of the keyring, so a hand-deleted file strands the entry.
			// Reaching for it on a machine with no account would touch the keyring on every command.
			expect(keyringStore.get(LEGACY_KEYRING_TOKEN_KEY)).toBe('tok_kr');
		});
	});
});
