import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import process from 'node:process';

import {
	__resetAuthFileForTests,
	AUTH_BACKUP_FILE_PATH,
	type AuthProfile,
	ensureAuthFileCurrent,
	getActiveProfile,
	lookUpActiveProfile,
	removeActiveProfile,
	setActiveProfile,
} from '../../../src/lib/auth-file.js';
import { resolveAuth } from '../../../src/lib/auth.js';
import { AUTH_FILE_PATH, GLOBAL_CONFIGS_FOLDER } from '../../../src/lib/consts.js';
import { ensureMigrated, getProxyPassword, getToken } from '../../../src/lib/credentials.js';
import { getLocalUserInfo } from '../../../src/lib/utils.js';
import { readActiveProfile, readAuthFile, v1AuthFile } from '../../__setup__/auth-file.js';
import { useAuthSetup, useKeyringBackend } from '../../__setup__/hooks/useAuthSetup.js';
import {
	KEYRING_PROXY_PASSWORD_KEY,
	KEYRING_TOKEN_KEY,
	keyringStore,
	resetKeyringMock,
} from '../../__setup__/keyring-mock.js';

vi.mock('@napi-rs/keyring', () => import('../../__setup__/keyring-mock.js'));

useAuthSetup();

const write = (contents: unknown) => {
	mkdirSync(GLOBAL_CONFIGS_FOLDER(), { recursive: true });
	writeFileSync(AUTH_FILE_PATH(), typeof contents === 'string' ? contents : JSON.stringify(contents));
};

const readBackup = () => JSON.parse(readFileSync(AUTH_BACKUP_FILE_PATH(), 'utf-8'));

const V2_PROFILE: AuthProfile = {
	username: 'me',
	name: null,
	authMethod: 'token',
	expiresAt: null,
	hasRefreshToken: false,
};

const V1_PROFILE = { id: 'uid', ...V2_PROFILE };

describe('auth.json v2', () => {
	beforeEach(() => {
		resetKeyringMock();
	});

	describe('migration', () => {
		// State A in the wild: plaintext secrets and no backend marker, written before the keyring.
		it('migrates state A, after ensureMigrated() has stamped the marker', async () => {
			write(v1AuthFile());

			await ensureMigrated();
			await ensureAuthFileCurrent();

			expect(readAuthFile()).toEqual({
				version: 2,
				activeProfile: 'uid',
				profiles: { uid: V2_PROFILE },
				secretsBackend: 'file',
				token: 'apify_api_v1_token',
				proxy: { password: 'pw' },
			});
		});

		// State C: plaintext secrets with the file marker already on them.
		it('migrates state C and keeps the secrets in the file', async () => {
			write(v1AuthFile({ secretsBackend: 'file' }));

			await ensureAuthFileCurrent();

			expect(readAuthFile()).toMatchObject({ version: 2, secretsBackend: 'file', token: 'apify_api_v1_token' });
			expect(await getToken()).toBe('apify_api_v1_token');
			expect(await getProxyPassword()).toBe('pw');
		});

		it('drops the fields nothing in the CLI reads', async () => {
			write(v1AuthFile({ secretsBackend: 'file' }));

			await ensureAuthFileCurrent();

			const file = readAuthFile();
			for (const key of ['email', 'plan', 'isPaying', 'createdAt', 'id', 'username']) {
				expect(file).not.toHaveProperty(key);
			}
			expect(file.proxy).toEqual({ password: 'pw' });
		});

		it('carries organizationOwnerUserId into the profile, and back out again', async () => {
			write(v1AuthFile({ secretsBackend: 'file', organizationOwnerUserId: 'owner-id' }));

			await ensureAuthFileCurrent();

			expect(readActiveProfile()).toMatchObject({ organizationOwnerUserId: 'owner-id' });
			// `push` and the Console URL read it from here; the file alone is not enough.
			await expect(getLocalUserInfo()).resolves.toMatchObject({ organizationOwnerUserId: 'owner-id' });
		});

		it('backs the v1 file up and never overwrites the backup', async () => {
			write(v1AuthFile({ secretsBackend: 'file' }));

			await ensureAuthFileCurrent();
			expect(readBackup()).toMatchObject({ id: 'uid', email: 'me@example.com' });

			// A later process migrating another v1 file must leave the first backup alone.
			write(v1AuthFile({ secretsBackend: 'file', username: 'someone-else' }));
			__resetAuthFileForTests();
			await ensureAuthFileCurrent();

			expect(readActiveProfile()).toMatchObject({ username: 'someone-else' });
			expect(readBackup()).toMatchObject({ username: 'me' });
		});

		it('is a no-op on a file that is already v2', async () => {
			write(v1AuthFile({ secretsBackend: 'file' }));
			await ensureAuthFileCurrent();
			const migrated = readAuthFile();

			// Without the reset the memoised promise short-circuits and the file is never re-read.
			__resetAuthFileForTests();
			await ensureAuthFileCurrent();

			expect(readAuthFile()).toEqual(migrated);
		});

		// The only code path that erases the plaintext v1 token from disk.
		it('logout removes the backup along with the file', async () => {
			write(v1AuthFile({ secretsBackend: 'file' }));
			await ensureAuthFileCurrent();
			expect(existsSync(AUTH_BACKUP_FILE_PATH())).toBe(true);

			removeActiveProfile();

			expect(existsSync(AUTH_FILE_PATH())).toBe(false);
			expect(existsSync(AUTH_BACKUP_FILE_PATH())).toBe(false);
		});

		// Only the temp-file + rename repairs an existing file's mode; a direct write would leave it.
		it.skipIf(process.platform === 'win32')('tightens a pre-existing 0644 auth.json to 0600', async () => {
			write(v1AuthFile({ secretsBackend: 'file' }));
			chmodSync(AUTH_FILE_PATH(), 0o644);

			await ensureAuthFileCurrent();

			expect(statSync(AUTH_FILE_PATH()).mode & 0o777).toBe(0o600);
		});

		// Windows has no POSIX modes: Node reports 0o666 there and chmod only moves the read-only bit.
		it.skipIf(process.platform === 'win32')(
			'writes the backup readable only by the owner, whatever mode the v1 file had',
			async () => {
				write(v1AuthFile({ secretsBackend: 'file' }));
				chmodSync(AUTH_FILE_PATH(), 0o644);

				await ensureAuthFileCurrent();

				expect(statSync(AUTH_BACKUP_FILE_PATH()).mode & 0o777).toBe(0o600);
			},
		);

		// The backup is never refreshed, so a token in it would outlive the account it belongs to.
		it('keeps the secrets out of the backup', async () => {
			write(v1AuthFile({ secretsBackend: 'file' }));

			await ensureAuthFileCurrent();

			const backup = readBackup();
			expect(backup).not.toHaveProperty('token');
			expect(backup).not.toHaveProperty('proxy');
			expect(backup).toMatchObject({ id: 'uid', username: 'me', email: 'me@example.com' });
		});

		it('does nothing when there is no file', async () => {
			await ensureAuthFileCurrent();

			expect(existsSync(AUTH_FILE_PATH())).toBe(false);
			expect(existsSync(AUTH_BACKUP_FILE_PATH())).toBe(false);
		});

		it('leaves a corrupt file alone rather than rewriting it', async () => {
			write('{ not json');

			await ensureAuthFileCurrent();

			expect(readFileSync(AUTH_FILE_PATH(), 'utf-8')).toBe('{ not json');
			expect(existsSync(AUTH_BACKUP_FILE_PATH())).toBe(false);
		});

		it('keeps the secrets of a v1 file that has no user ID, so the next command asks for a re-login', async () => {
			write({ token: 'apify_api_v1_token', secretsBackend: 'file' });

			await ensureAuthFileCurrent();

			expect(readAuthFile()).toEqual({
				version: 2,
				profiles: {},
				secretsBackend: 'file',
				token: 'apify_api_v1_token',
			});
			// The token stays in auth.json, where the re-login prompt can see it, not in the backup.
			expect(readBackup()).toEqual({ secretsBackend: 'file' });
			await expect(getLocalUserInfo()).rejects.toThrow('Stale credentials found without user metadata');
		});
	});

	describe('reading the active profile', () => {
		it('reads a v1 file that has not been migrated yet', () => {
			write(v1AuthFile());

			expect(getActiveProfile()).toEqual(V1_PROFILE);
		});

		it('returns nothing when no profile is stored', () => {
			write({ version: 2, profiles: {} });

			expect(lookUpActiveProfile()).toEqual({});
		});

		it('names the profile activeProfile points at when the file does not contain it', () => {
			write({ version: 2, activeProfile: 'gone', profiles: {} });

			expect(lookUpActiveProfile()).toEqual({ missingProfile: 'gone' });
		});

		it('names the missing profile rather than reporting a silent logged-out state', async () => {
			write({ version: 2, activeProfile: 'gone', profiles: {}, secretsBackend: 'file', token: 'tok' });

			await expect(getLocalUserInfo()).rejects.toThrow('Your active profile "gone" is missing');
		});

		it('is logged out when the missing profile leaves no token behind either', async () => {
			write({ version: 2, activeProfile: 'gone', profiles: {}, secretsBackend: 'file' });

			await expect(getLocalUserInfo()).resolves.toEqual({});
		});
	});

	describe('a file a newer CLI wrote', () => {
		it('is refused rather than migrated backwards', async () => {
			write({ version: 3, activeProfile: 'uid', profiles: {} });

			await expect(ensureAuthFileCurrent()).rejects.toThrow('written by a newer Apify CLI');
		});

		it('is not replaced by a login', () => {
			const newer = { version: 3, activeProfile: 'uid', profiles: { uid: { username: 'me' } } };
			write(newer);

			expect(() => setActiveProfile('uid2', V2_PROFILE, 'file')).toThrow('written by a newer Apify CLI');
			expect(readAuthFile()).toEqual(newer);
		});

		it('is not touched by a logout', () => {
			const newer = { version: 3, activeProfile: 'uid', profiles: { uid: { username: 'me' } }, token: 'tok' };
			write(newer);

			expect(() => removeActiveProfile()).toThrow('written by a newer Apify CLI');
			expect(readAuthFile()).toEqual(newer);
		});
	});

	// Both were deletable with a green suite: every other test calls ensureAuthFileCurrent() by hand.
	describe('the command paths that trigger the migration', () => {
		it('getLocalUserInfo() migrates the file it reads', async () => {
			write(v1AuthFile({ secretsBackend: 'file' }));

			await expect(getLocalUserInfo()).resolves.toMatchObject({ id: 'uid', username: 'me' });

			expect(readAuthFile().version).toBe(2);
		});

		it('resolving a token migrates the file it reads', async () => {
			write(v1AuthFile({ secretsBackend: 'file' }));

			await expect(resolveAuth()).resolves.toMatchObject({ source: 'stored' });

			expect(readAuthFile().version).toBe(2);
		});

		it('a file a newer CLI wrote stops a command rather than being read as v1', async () => {
			write({ version: 3, activeProfile: 'uid', profiles: {}, secretsBackend: 'file', token: 'tok' });

			await expect(getLocalUserInfo()).rejects.toThrow('written by a newer Apify CLI');
			await expect(resolveAuth()).rejects.toThrow('written by a newer Apify CLI');
		});
	});

	describe('keyring backend', () => {
		useKeyringBackend();

		// State B in the wild: secrets already in the keyring, auth.json holding only metadata.
		it('migrates state B without touching the keyring', async () => {
			keyringStore.set(KEYRING_TOKEN_KEY, 'tok_kr');
			keyringStore.set(KEYRING_PROXY_PASSWORD_KEY, 'pw_kr');
			write({ id: 'uid', username: 'me', email: 'me@example.com', secretsBackend: 'keyring' });

			await ensureMigrated();
			await ensureAuthFileCurrent();

			expect(readAuthFile()).toEqual({
				version: 2,
				activeProfile: 'uid',
				profiles: { uid: V2_PROFILE },
				secretsBackend: 'keyring',
			});
			expect(await getLocalUserInfo()).toEqual({
				id: 'uid',
				username: 'me',
				token: 'tok_kr',
				proxy: { password: 'pw_kr' },
			});
		});

		// State A on a machine where the keyring works: ensureMigrated() moves the secrets first.
		it('migrates state A to the keyring and then to v2', async () => {
			write(v1AuthFile());

			await ensureMigrated();
			await ensureAuthFileCurrent();

			expect(keyringStore.get(KEYRING_TOKEN_KEY)).toBe('apify_api_v1_token');
			expect(readAuthFile()).toEqual({
				version: 2,
				activeProfile: 'uid',
				profiles: { uid: V2_PROFILE },
				secretsBackend: 'keyring',
			});
		});
	});
});
