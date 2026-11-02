import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';

import { cryptoRandomObjectId } from '@apify/utilities';

import { AUTH_FILE_PATH } from './consts.js';
import type { SecretKind } from './credentials.js';
import { ensureApifyDirectory } from './files.js';
import { warning } from './outputs.js';
import { cliDebugPrint } from './utils/cliDebugPrint.js';

export const AUTH_FILE_VERSION = 2;

/** Where an OAuth login came from and how long its refresh token lasts; the secrets live elsewhere. */
export interface OAuthProfileState {
	issuer: string;
	clientId: string;
	tokenEndpoint: string;
	refreshTokenExpiresAt: string | null;
}

/**
 * One account. Keyed by user ID in {@link AuthFile.profiles}, so renaming a profile can never
 * orphan the secret that key names.
 */
export interface AuthProfile {
	username?: string;
	/** Human label for `--profile <name>`. */
	name: string | null;
	/** Set means the profile is an organization rather than a personal account. */
	organizationOwnerUserId?: string;
	authMethod: 'token' | 'oauth2';
	/** Access token expiry of an `oauth2` login; `null` for a plain API token. */
	expiresAt: string | null;
	hasRefreshToken: boolean;
	loggedInAt: string | null;
	/** Set for an `oauth2` login. */
	oauth?: OAuthProfileState;
	/**
	 * Set only when the keyring is disabled, unavailable, or refused the write. A token here is
	 * the record of where this profile's secrets live: no marker says so separately.
	 */
	token?: string;
	proxy?: { password?: string };
	refreshToken?: string;
}

/**
 * `auth.json` as this CLI writes it. Top-level `token` and `proxy` are where the file backend kept
 * secrets before they were keyed per profile; `ensureSecretsKeyed()` moves them into the profile.
 */
export interface AuthFile {
	version?: number;
	activeProfile?: string;
	profiles?: Record<string, AuthProfile>;
	token?: string;
	proxy?: { password?: string; [k: string]: unknown };
}

/**
 * The flat shape written before profiles existed: one account spread across the top level, and no
 * `version` field. Only the migration and the pre-migration read path see it.
 */
export interface LegacyAuthFile extends AuthFile {
	id?: string;
	username?: string;
	organizationOwnerUserId?: string;
}

export interface ActiveProfileLookup {
	profile?: AuthProfile & { id: string };
	/** Set when `activeProfile` names a profile the file does not contain. */
	missingProfile?: string;
}

let migrationPromise: Promise<void> | undefined;

/** Test-only: let each test run the migration again. */
export function __resetAuthFileForTests() {
	migrationPromise = undefined;
}

/** `null` tells a corrupt file from an absent one, which the migration must not overwrite. */
function parseAuthFile(): AuthFile | null {
	if (!existsSync(AUTH_FILE_PATH())) return {};

	try {
		const parsed: unknown = JSON.parse(readFileSync(AUTH_FILE_PATH(), 'utf-8'));
		// A valid JSON string or array is as unusable as a parse error, and must not be rewritten.
		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;

		return parsed as AuthFile;
	} catch {
		return null;
	}
}

export function readAuthFile(): AuthFile {
	return parseAuthFile() ?? {};
}

export function writeAuthFile(data: AuthFile) {
	atomicWriteJson(AUTH_FILE_PATH(), data);
}

/** Temp file then rename: two CLI processes can run at once, and a torn file reads as logged out. */
function atomicWriteJson(path: string, data: unknown) {
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

function v1Profile(file: LegacyAuthFile): AuthProfile {
	return {
		...(typeof file.username === 'string' ? { username: file.username } : {}),
		name: null,
		...(typeof file.organizationOwnerUserId === 'string'
			? { organizationOwnerUserId: file.organizationOwnerUserId }
			: {}),
		authMethod: 'token',
		expiresAt: null,
		hasRefreshToken: false,
		loggedInAt: null,
	};
}

/**
 * A v1 file described one account, so everything in it belongs to one profile. `email`, `plan`,
 * `effectivePlatformFeatures`, `isPaying`, `createdAt` and `proxy.groups` are dropped — nothing in
 * the CLI reads them.
 */
function toV2(file: LegacyAuthFile): AuthFile {
	const migrated: AuthFile = { version: AUTH_FILE_VERSION, profiles: {} };

	// A v1 file with a token but no ID has no key to store the profile under. The secrets are
	// carried over here and dropped by `ensureSecretsKeyed()`, which is what forces the re-login.
	if (typeof file.id === 'string') {
		migrated.activeProfile = file.id;
		migrated.profiles![file.id] = v1Profile(file);
	}

	if (typeof file.token === 'string') migrated.token = file.token;
	if (typeof file.proxy?.password === 'string') migrated.proxy = { password: file.proxy.password };

	return migrated;
}

/**
 * One entry per format bump, keyed by the version it upgrades from. A file at version N runs every
 * step from N upwards, so moving data between shapes later means adding an entry here rather than
 * reworking this module. The first shape carried no `version` field at all; it counts as 1.
 */
const MIGRATION_STEPS: Record<number, (file: AuthFile) => AuthFile> = {
	1: toV2,
};

const FIRST_AUTH_FILE_VERSION = 1;

async function migrateAuthFile(): Promise<void> {
	migrationPromise ??= (async () => {
		try {
			const file = parseAuthFile();

			// A corrupt file is left alone: readers already treat it as logged out, and rewriting
			// it would destroy what the user could still recover by hand.
			if (!file) return;
			if (Object.keys(file).length === 0) return;

			const from = typeof file.version === 'number' ? file.version : FIRST_AUTH_FILE_VERSION;
			if (from >= AUTH_FILE_VERSION) return;

			let migrated = file;
			for (let version = from; version < AUTH_FILE_VERSION; version++) {
				const step = MIGRATION_STEPS[version];
				if (!step) throw new Error(`No migration step from auth file version ${version}.`);

				migrated = step(migrated);
			}

			writeAuthFile(migrated);
		} catch (err) {
			// Not rethrown: the migration must not abort the command, which fails at the auth step.
			cliDebugPrint('auth-file', 'auth file migration failed', err);
			warning({
				message: `Your stored login cannot be read until ${AUTH_FILE_PATH()} is updated to the current format, and the update failed. Make the directory it is in writable, then run the command again. Set APIFY_CLI_DEBUG=1 to see why.`,
			});
		}
	})();

	return migrationPromise;
}

/**
 * A file from a newer CLI is not something to guess at — migrating it backwards would drop
 * whatever that version stores.
 */
export function assertSupportedAuthFileVersion() {
	const { version } = readAuthFile();

	if (typeof version === 'number' && version > AUTH_FILE_VERSION) {
		throw new Error(
			`Your credentials in ${AUTH_FILE_PATH()} were written by a newer Apify CLI. It uses auth file version ${version} and this one reads ${AUTH_FILE_VERSION}. Upgrade the CLI, or run "apify logout" to discard them.`,
		);
	}
}

/**
 * Runs after `ensureMigrated()`, which moves v1 secrets into the keyring. The two stay separate so
 * a keyring failure and a shape failure cannot mask each other.
 *
 * Migrating never throws — it must not block a command. Throws only for a file a newer CLI wrote.
 */
export async function ensureAuthFileCurrent(): Promise<void> {
	await migrateAuthFile();
	assertSupportedAuthFileVersion();
}

/**
 * Reads the pre-profile shape as well, and keeps doing so: `useRentalSunsetNotice` calls this
 * without migrating first, to avoid a keychain prompt on commands that need no login.
 */
export function lookUpActiveProfile(): ActiveProfileLookup {
	const file = readAuthFile();

	if (file.version !== AUTH_FILE_VERSION) {
		// Pre-migration, or a version this CLI does not know. Either way the only account it can
		// name is the flat one, and a newer file has no top-level id to find.
		const legacy = file as LegacyAuthFile;
		return typeof legacy.id === 'string' ? { profile: { id: legacy.id, ...v1Profile(legacy) } } : {};
	}

	if (!file.activeProfile) return {};

	const profile = file.profiles?.[file.activeProfile];
	if (!profile) return { missingProfile: file.activeProfile };

	return { profile: { id: file.activeProfile, ...profile } };
}

export type StoredProfile = AuthProfile & { id: string };

export function profileLabel(profile: StoredProfile) {
	return profile.name ?? profile.username ?? profile.id;
}

/** Every stored profile, in file order. Reads the pre-profile shape as its one account. */
export function listProfiles(): StoredProfile[] {
	const file = readAuthFile();
	if (file.version !== AUTH_FILE_VERSION) {
		const { profile } = lookUpActiveProfile();
		return profile ? [profile] : [];
	}

	return Object.entries(file.profiles ?? {}).map(([id, profile]) => ({ id, ...profile }));
}

/**
 * The profiles a `--profile` value names: the one with that user ID, otherwise every profile whose
 * `profileLabel` matches. More than one match means the name is ambiguous.
 */
export function matchProfiles(nameOrId: string): StoredProfile[] {
	const profiles = listProfiles();
	const byId = profiles.find(({ id }) => id === nameOrId);
	return byId ? [byId] : profiles.filter((p) => profileLabel(p) === nameOrId);
}

/** Like {@link lookUpActiveProfile}, for the profile with this user ID. */
export function lookUpProfile(userId: string): ActiveProfileLookup {
	const profile = listProfiles().find(({ id }) => id === userId);
	return profile ? { profile } : { missingProfile: userId };
}

/** Makes a stored profile active. A user ID the file does not hold is ignored. */
export function setActiveProfile(userId: string) {
	const file = readAuthFile();
	if (!file.profiles?.[userId]) return;

	file.activeProfile = userId;
	writeAuthFile(file);
}

export function getActiveProfile(): StoredProfile | undefined {
	return lookUpActiveProfile().profile;
}

/**
 * The user ID every secret is keyed by. Taken from `activeProfile` rather than from the profile
 * object, so a file whose `activeProfile` names a missing profile still resolves its secrets and
 * reports the dangling profile instead of looking logged out.
 */
export function getActiveProfileId(): string | undefined {
	const file = readAuthFile();

	if (file.version !== AUTH_FILE_VERSION) {
		const legacy = file as LegacyAuthFile;
		return typeof legacy.id === 'string' ? legacy.id : undefined;
	}

	return file.activeProfile;
}

/** The file backend's stored secret, or `undefined` when the profile does not hold one. */
export function readProfileSecret(userId: string, kind: SecretKind): string | undefined {
	const profile = readAuthFile().profiles?.[userId];
	if (!profile) return undefined;

	switch (kind) {
		case 'token':
			return profile.token;
		case 'refresh-token':
			return profile.refreshToken;
		default:
			return profile.proxy?.password;
	}
}

/**
 * Stores a file-backend secret on the profile. A missing profile is left alone: inventing one
 * would fabricate the account metadata the CLI reads.
 */
export function writeProfileSecret(userId: string, kind: SecretKind, value: string) {
	updateProfile(userId, (profile) => setProfileSecret(profile, kind, value));
}

/** Forgets every file-backend secret of a profile, once its token is in the keyring. */
export function clearProfileFileSecrets(userId: string) {
	const profile = readAuthFile().profiles?.[userId];
	if (profile?.token === undefined && profile?.proxy === undefined && profile?.refreshToken === undefined) return;

	updateProfile(userId, (edited) => {
		delete edited.token;
		delete edited.proxy;
		delete edited.refreshToken;
	});
}

function setProfileSecret(profile: AuthProfile, kind: SecretKind, value: string) {
	if (kind === 'token') {
		profile.token = value;
	} else if (kind === 'refresh-token') {
		profile.refreshToken = value;
	} else {
		profile.proxy = { ...profile.proxy, password: value };
	}
}

/** Forgets one of a profile's file-backend secrets. */
export function deleteProfileSecret(userId: string, kind: SecretKind) {
	if (readProfileSecret(userId, kind) === undefined) return;

	updateProfile(userId, (profile) => {
		if (kind === 'token') {
			delete profile.token;
		} else if (kind === 'refresh-token') {
			delete profile.refreshToken;
		} else {
			// The profile's proxy object carries nothing but the password.
			delete profile.proxy;
		}
	});
}

function updateProfile(userId: string, edit: (profile: AuthProfile) => void) {
	const file = readAuthFile();
	const profile = file.profiles?.[userId];
	if (!profile) return;

	edit(profile);
	writeAuthFile(file);
}

/** Records how a stored profile authenticates. `oauth` left out means a plain API token. */
export function updateProfileAuth(
	userId: string,
	auth: Pick<AuthProfile, 'authMethod' | 'expiresAt' | 'hasRefreshToken'> & { oauth?: OAuthProfileState },
) {
	updateProfile(userId, (profile) => {
		profile.authMethod = auth.authMethod;
		profile.expiresAt = auth.expiresAt;
		profile.hasRefreshToken = auth.hasRefreshToken;
		if (auth.oauth) {
			profile.oauth = auth.oauth;
		} else {
			delete profile.oauth;
		}
	});
}

/**
 * Adds the account, or updates it in place when it is already stored, and makes it active. Other
 * profiles are kept. A stored profile keeps its file-backend secrets until the caller writes the
 * new ones, so a failed write leaves the old login in place rather than none.
 */
export function upsertProfile(userId: string, profile: AuthProfile) {
	assertSupportedAuthFileVersion();

	const current = readAuthFile();
	// A file the migration could not bring to v2 has no profiles to keep.
	const file: AuthFile = current.version === AUTH_FILE_VERSION ? current : { version: AUTH_FILE_VERSION };
	file.profiles ??= {};
	// Unkeyed secrets belong to the account that was active, and re-keying would file them under this one.
	delete file.token;
	delete file.proxy;

	const existing = file.profiles[userId];
	file.profiles[userId] = {
		...profile,
		...(existing?.token ? { token: existing.token } : {}),
		...(existing?.proxy ? { proxy: existing.proxy } : {}),
		...(existing?.refreshToken ? { refreshToken: existing.refreshToken } : {}),
	};

	file.activeProfile = userId;
	writeAuthFile(file);
}

/**
 * Drops a profile together with the secrets stored beside it; the active one when no ID is given.
 * Removing the active profile makes the one with the most recent `loggedInAt` active. The file goes
 * away once no profile is left, so logging out leaves no token on disk.
 */
export function removeProfile(userId?: string): {
	removed?: StoredProfile;
	active?: StoredProfile;
} {
	const file = readAuthFile();

	// No version guard: refusing to discard a file this CLI cannot read leaves no way out. It goes
	// whole rather than edited, which would leave something worse than either outcome.
	if (file.version !== AUTH_FILE_VERSION) {
		discardAuthFile();
		return {};
	}

	const removedId = userId ?? file.activeProfile;
	const removedProfile = removedId ? file.profiles?.[removedId] : undefined;
	const removed = removedId && removedProfile ? { id: removedId, ...removedProfile } : undefined;

	if (removedId && file.profiles) delete file.profiles[removedId];

	if (removedId !== file.activeProfile) {
		writeAuthFile(file);
		const activeProfile = file.activeProfile ? file.profiles?.[file.activeProfile] : undefined;
		return { removed, active: activeProfile && { id: file.activeProfile!, ...activeProfile } };
	}

	delete file.activeProfile;
	delete file.token;
	delete file.proxy;

	const [nextId] = Object.entries(file.profiles ?? {})
		.sort(([, a], [, b]) => (b.loggedInAt ?? '').localeCompare(a.loggedInAt ?? ''))
		.map(([id]) => id);

	if (!nextId) {
		discardAuthFile();
		return { removed };
	}

	file.activeProfile = nextId;
	writeAuthFile(file);
	return { removed, active: { id: nextId, ...file.profiles![nextId] } };
}

/** Deletes the auth file. The caller clears the keyring first, while the file still indexes it. */
export function removeAllProfiles() {
	discardAuthFile();
}

function discardAuthFile() {
	// Retries because Windows refuses the unlink while an antivirus or a second process holds it.
	rmSync(AUTH_FILE_PATH(), { force: true, maxRetries: 10, retryDelay: 100 });
}
