import { copyFileSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';

import { cryptoRandomObjectId } from '@apify/utilities';

import { AUTH_FILE_PATH } from './consts.js';
import type { CredentialsBackend } from './credentials.js';
import { ensureApifyDirectory } from './files.js';
import { cliDebugPrint } from './utils/cliDebugPrint.js';

const AUTH_FILE_VERSION = 2;

/** The way back to a CLI that only reads the v1 shape. */
export const AUTH_BACKUP_FILE_PATH = () => `${AUTH_FILE_PATH()}.v1.bak`;

/**
 * One account. Keyed by user ID in {@link AuthFile.profiles}, so renaming a profile can never
 * orphan the secret that key names.
 */
export interface AuthProfile {
	username?: string;
	/** Human label for `--profile <name>`. Unused until profiles get names. */
	name: string | null;
	/** Set means the profile is an organization rather than a personal account. */
	organizationOwnerUserId?: string;
	/** How the token was obtained. Unused until the device flow lands. */
	authMethod: 'token';
	/** When the access token expires. Unused until the device flow lands. */
	expiresAt: string | null;
	/** Whether a refresh token came with the access token. Unused until the device flow lands. */
	hasRefreshToken: boolean;
}

/**
 * `auth.json` as it sits on disk. `token` and `proxy` are the file backend's secret storage; they
 * stay outside the profiles until each profile gets its own keys.
 */
export interface AuthFile {
	version?: number;
	activeProfile?: string;
	profiles?: Record<string, AuthProfile>;
	secretsBackend?: CredentialsBackend;
	token?: string;
	proxy?: { password?: string; [k: string]: unknown };
	[k: string]: unknown;
}

export interface ActiveProfileLookup {
	profile?: AuthProfile & { id: string };
	/** Set when `activeProfile` names a profile the file does not contain. */
	missingProfile?: string;
}

let migrationPromise: Promise<void> | undefined;

/** Test-only: let each test run the v2 migration again. */
export function __resetAuthFileForTests() {
	migrationPromise = undefined;
}

/** `null` tells a corrupt file from an absent one, which the migration must not overwrite. */
function parseAuthFile(): AuthFile | null {
	if (!existsSync(AUTH_FILE_PATH())) return {};

	try {
		return JSON.parse(readFileSync(AUTH_FILE_PATH(), 'utf-8')) as AuthFile;
	} catch {
		return null;
	}
}

/** The parsed file, or an empty object when it is missing or unreadable. */
export function readAuthFile(): AuthFile {
	return parseAuthFile() ?? {};
}

/**
 * Atomic write: a temp file next to the target, then a rename. Two CLI processes can run at once,
 * and a half-written auth.json reads as logged out.
 */
export function writeAuthFile(data: AuthFile) {
	const path = AUTH_FILE_PATH();
	ensureApifyDirectory(path);

	const tempPath = `${path}.tmp-${cryptoRandomObjectId(8)}`;

	try {
		writeFileSync(tempPath, JSON.stringify(data, null, '\t'), { mode: 0o600 });
		renameSync(tempPath, path);
	} catch (err) {
		rmSync(tempPath, { force: true });
		throw err;
	}
}

/** The one account a v1 file described, as a profile. */
function v1Profile(file: AuthFile): AuthProfile {
	return {
		...(typeof file.username === 'string' ? { username: file.username } : {}),
		name: null,
		...(typeof file.organizationOwnerUserId === 'string'
			? { organizationOwnerUserId: file.organizationOwnerUserId }
			: {}),
		authMethod: 'token',
		expiresAt: null,
		hasRefreshToken: false,
	};
}

/**
 * A v1 file described one account, so everything in it belongs to one profile. `email`, `plan`,
 * `effectivePlatformFeatures`, `isPaying`, `createdAt` and `proxy.groups` are dropped — nothing in
 * the CLI reads them.
 */
function toV2(file: AuthFile): AuthFile {
	const migrated: AuthFile = { version: AUTH_FILE_VERSION, profiles: {} };

	// A v1 file with a token but no ID has no key to store the profile under. Keep the secrets so
	// the next command reports stale credentials instead of a silent logged-out state.
	if (typeof file.id === 'string') {
		migrated.activeProfile = file.id;
		migrated.profiles![file.id] = v1Profile(file);
	}

	if (file.secretsBackend) migrated.secretsBackend = file.secretsBackend;
	if (typeof file.token === 'string') migrated.token = file.token;
	if (typeof file.proxy?.password === 'string') migrated.proxy = { password: file.proxy.password };

	return migrated;
}

/** Never overwrites an existing backup: the first one is the file the user started with. */
function backUpV1File() {
	if (existsSync(AUTH_BACKUP_FILE_PATH())) return;
	copyFileSync(AUTH_FILE_PATH(), AUTH_BACKUP_FILE_PATH());
}

async function migrateToV2(): Promise<void> {
	migrationPromise ??= (async () => {
		try {
			const file = parseAuthFile();

			// A corrupt file is left alone: readers already treat it as logged out, and rewriting
			// it would destroy what the user could still recover by hand.
			if (!file) return;
			// A numbered version is either already current or from another CLI; either way there
			// is nothing to migrate. `assertSupportedAuthFileVersion` reports a newer one.
			if (typeof file.version === 'number') return;
			if (Object.keys(file).length === 0) return;

			backUpV1File();
			writeAuthFile(toV2(file));
		} catch (err) {
			cliDebugPrint('auth-file', 'migration to v2 failed', err);
		}
	})();

	return migrationPromise;
}

/**
 * A file from a newer CLI is not something to guess at — migrating it backwards would drop
 * whatever that version stores.
 */
function assertSupportedAuthFileVersion() {
	const { version } = readAuthFile();

	if (typeof version === 'number' && version > AUTH_FILE_VERSION) {
		throw new Error(
			`Your credentials in ${AUTH_FILE_PATH()} were written by a newer Apify CLI (auth file version ${version}, this one reads ${AUTH_FILE_VERSION}). Upgrade the CLI to use them.`,
		);
	}
}

/**
 * Brings `auth.json` to the v2 profile shape and refuses a file a newer CLI wrote. Runs after
 * `ensureMigrated()`, which moves v1 secrets into the keyring; the two steps stay separate so a
 * keyring failure and a shape failure cannot mask each other.
 *
 * The migration itself is idempotent, single-flight and never throws — it must not block a command.
 */
export async function ensureAuthFileCurrent(): Promise<void> {
	await migrateToV2();
	assertSupportedAuthFileVersion();
}

/**
 * The active profile with its user ID. Reads a v1 file too, so a command that runs before the
 * migration still finds the account.
 */
export function lookUpActiveProfile(): ActiveProfileLookup {
	const file = readAuthFile();

	if (file.version !== AUTH_FILE_VERSION) {
		return typeof file.id === 'string' ? { profile: { id: file.id, ...v1Profile(file) } } : {};
	}

	if (!file.activeProfile) return {};

	const profile = file.profiles?.[file.activeProfile];
	if (!profile) return { missingProfile: file.activeProfile };

	return { profile: { id: file.activeProfile, ...profile } };
}

/** The active profile, or `undefined` when nothing usable is stored. */
export function getActiveProfile(): (AuthProfile & { id: string }) | undefined {
	return lookUpActiveProfile().profile;
}

/**
 * Stores one account and makes it active, replacing whatever was there. Nothing puts a second
 * profile in the file yet, so `apify login` owns all of it.
 */
export function setActiveProfile(userId: string, profile: AuthProfile, secretsBackend: CredentialsBackend) {
	assertSupportedAuthFileVersion();

	writeAuthFile({
		version: AUTH_FILE_VERSION,
		activeProfile: userId,
		profiles: { [userId]: profile },
		secretsBackend,
	});
}

/**
 * Drops the active profile together with the secrets stored beside it. The file and the v1 backup
 * go away once no profile is left, so logging out leaves no token on disk.
 */
export function removeActiveProfile() {
	assertSupportedAuthFileVersion();

	const file = readAuthFile();
	const active = file.version === AUTH_FILE_VERSION ? file.activeProfile : undefined;

	if (active && file.profiles) delete file.profiles[active];
	delete file.activeProfile;
	delete file.token;
	delete file.proxy;

	if (Object.keys(file.profiles ?? {}).length === 0) {
		rmSync(AUTH_FILE_PATH(), { force: true });
		rmSync(AUTH_BACKUP_FILE_PATH(), { force: true });
		return;
	}

	writeAuthFile(file);
}
