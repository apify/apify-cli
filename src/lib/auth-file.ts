import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';

import { cryptoRandomObjectId } from '@apify/utilities';

import { AUTH_FILE_PATH } from './consts.js';
import type { CredentialsBackend } from './credentials.js';
import { ensureApifyDirectory } from './files.js';
import { warning } from './outputs.js';
import { cliDebugPrint } from './utils/cliDebugPrint.js';

export const AUTH_FILE_VERSION = 2;

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
	/** These three are unread until the device flow lands, and reserved so it needs no migration. */
	authMethod: 'token';
	expiresAt: string | null;
	hasRefreshToken: boolean;
	/** Reserved: a keyring failure on one profile must not redirect another profile's reads. */
	secretsBackend?: CredentialsBackend;
	loggedInAt: string | null;
}

/**
 * `auth.json` as this CLI writes it. `token` and `proxy` are the file backend's secret storage;
 * they stay outside the profiles until each profile gets its own keys.
 */
export interface AuthFile {
	version?: number;
	activeProfile?: string;
	profiles?: Record<string, AuthProfile>;
	secretsBackend?: CredentialsBackend;
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

/**
 * A snapshot of the pre-v2 file, so an upgrade is inspectable. Written once and never refreshed,
 * which is why the secrets are left out: a rotated token copied here would outlive the account it
 * belongs to. Nothing reads it.
 */
function backUpV1File(file: AuthFile) {
	if (existsSync(AUTH_BACKUP_FILE_PATH())) return;

	const { token: _token, proxy: _proxy, ...withoutSecrets } = file;
	atomicWriteJson(AUTH_BACKUP_FILE_PATH(), withoutSecrets);
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

			// The backup captures the shape the user arrived with, before any step touches it.
			if (from === FIRST_AUTH_FILE_VERSION) backUpV1File(file);

			let migrated = file;
			for (let version = from; version < AUTH_FILE_VERSION; version++) {
				const step = MIGRATION_STEPS[version];
				if (!step) throw new Error(`No migration step from auth file version ${version}.`);

				migrated = step(migrated);
			}

			writeAuthFile(migrated);
		} catch (err) {
			// The readers understand the old shape, so nothing is broken and the next command tries
			// again. Still said out loud, because failing on every run should not be invisible.
			cliDebugPrint('auth-file', 'auth file migration failed', err);
			warning({
				message: `Your login still works, but ${AUTH_FILE_PATH()} could not be updated to the current format. Set APIFY_CLI_DEBUG=1 to see why.`,
			});
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

export function getActiveProfile(): (AuthProfile & { id: string }) | undefined {
	return lookUpActiveProfile().profile;
}

/**
 * Replaces the file with this one account. A second profile would name an account that cannot
 * authenticate until each has its own secret, and dropping the old secrets is what keeps the write
 * safe: the caller writes the new token next, so a failure there leaves nobody logged in rather
 * than the old token beside the new name. Additive login is #1386.
 */
export function replaceStoredAccount(userId: string, profile: AuthProfile, secretsBackend: CredentialsBackend) {
	assertSupportedAuthFileVersion();

	// The snapshot described the account being replaced, and is never refreshed, so keeping it
	// would leave one user's details on disk under another user's login.
	rmSync(AUTH_BACKUP_FILE_PATH(), { force: true, maxRetries: 10, retryDelay: 100 });

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
	const file = readAuthFile();

	// No version guard: refusing to discard a file this CLI cannot read leaves no way out. It goes
	// whole rather than edited, which would leave something worse than either outcome.
	if (file.version !== AUTH_FILE_VERSION) {
		discardAuthFiles();
		return;
	}

	const active = file.activeProfile;
	if (active && file.profiles) delete file.profiles[active];
	delete file.activeProfile;
	delete file.token;
	delete file.proxy;

	if (Object.keys(file.profiles ?? {}).length === 0) {
		discardAuthFiles();
		return;
	}

	writeAuthFile(file);
}

function discardAuthFiles() {
	rmSync(AUTH_FILE_PATH(), { force: true, maxRetries: 10, retryDelay: 100 });
	rmSync(AUTH_BACKUP_FILE_PATH(), { force: true, maxRetries: 10, retryDelay: 100 });
}
