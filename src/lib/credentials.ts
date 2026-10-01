import process from 'node:process';

import type { AuthFile } from './auth-file.js';
import {
	AUTH_FILE_VERSION,
	clearProfileFileSecrets,
	deleteProfileSecret,
	ensureAuthFileCurrent,
	readAuthFile,
	readProfileSecret,
	writeAuthFile,
	writeProfileSecret,
} from './auth-file.js';
import { useCLIMetadata } from './hooks/useCLIMetadata.js';
import { cliDebugPrint } from './utils/cliDebugPrint.js';

/**
 * Base service name. The per-kind services hang off it; the bare name is where secrets sat before
 * they were keyed by user.
 */
const KEYRING_SERVICE = 'com.apify.cli';

export type CredentialsBackend = 'keyring' | 'file';

export type SecretKind = 'token' | 'proxy-password';

const SECRET_KINDS: readonly SecretKind[] = ['token', 'proxy-password'];

export interface KeyringKey {
	service: string;
	account: string;
}

/**
 * One keyring service per kind, with the user ID as the account. A composite account name
 * (`token:<userId>` under a single service) would depend on `:` being legal in an account name on
 * macOS Keychain, libsecret and Windows Credential Manager, and it reads worse in keyring UIs.
 */
function keyringKey(userId: string, kind: SecretKind): KeyringKey {
	return { service: `${KEYRING_SERVICE}.${kind}`, account: userId };
}

/** Where a secret sat before it was keyed by user: one service, the kind as the account. */
function legacyKeyringKey(kind: SecretKind): KeyringKey {
	return { service: KEYRING_SERVICE, account: kind };
}

/** A secret a delete could not remove, named by where it still is. */
export interface KeyringLeftover {
	key: KeyringKey;
	error: unknown;
}

interface KeyringEntry {
	getPassword(): string | null;
	setPassword(password: string): void;
	deletePassword(): boolean;
}

interface KeyringModule {
	Entry: new (service: string, account: string) => KeyringEntry;
}

let cachedKeyringModule: KeyringModule | null | undefined;
let backendPromise: Promise<CredentialsBackend> | undefined;
let migrationPromise: Promise<void> | undefined;
let keyingPromise: Promise<void> | undefined;

/** Test-only: clear cached module/backend/migration so each test starts fresh. */
export function __resetCredentialsForTests() {
	cachedKeyringModule = undefined;
	backendPromise = undefined;
	migrationPromise = undefined;
	keyingPromise = undefined;
}

async function loadKeyringModule(): Promise<KeyringModule | null> {
	if (cachedKeyringModule !== undefined) return cachedKeyringModule;
	cachedKeyringModule = await importKeyringModule();
	return cachedKeyringModule;
}

async function importKeyringModule(): Promise<KeyringModule | null> {
	// Bundle distributions can't load the `@napi-rs/keyring` wrapper: its createRequire-based
	// platform loader isn't followed by Bun's `--compile`, so the native module never makes it
	// into the binary. Instead each bundle embeds exactly one platform subpackage, and the
	// specifier below is rewritten to it at build time (see scripts/build-cli-bundles.ts).
	if (useCLIMetadata().installMethod === 'bundle') {
		try {
			const mod = (await import('__APIFY_KEYRING_NATIVE_SUBPACKAGE__')) as Partial<KeyringModule> & {
				default?: Partial<KeyringModule>;
			};
			const Entry = mod.Entry ?? mod.default?.Entry;
			return Entry ? { Entry } : null;
		} catch (err) {
			cliDebugPrint('credentials', 'failed to load bundled keyring', err);
			return null;
		}
	}

	try {
		// Indirect specifier so tsc doesn't try to resolve the module at compile time.
		const specifier = '@napi-rs/keyring';
		return (await import(specifier)) as KeyringModule;
	} catch (err) {
		cliDebugPrint('credentials', 'failed to load @napi-rs/keyring', err);
		return null;
	}
}

/**
 * Where new secrets go: the keyring, unless APIFY_DISABLE_KEYRING=1 is set or the keyring module
 * cannot load. Nothing on disk overrides it, so a past keyring failure never pins a later write to
 * the file. Cached for the process; single-flight so concurrent callers share the lookup.
 *
 * No write-probe runs here: on macOS that would pop a keychain prompt before the user has
 * authorized one. The first real write is the probe, and a failure falls back to the file.
 */
export async function getBackend(): Promise<CredentialsBackend> {
	if (backendPromise) return backendPromise;
	backendPromise = (async (): Promise<CredentialsBackend> => {
		if (process.env.APIFY_DISABLE_KEYRING === '1') return 'file';

		const mod = await loadKeyringModule();
		return mod ? 'keyring' : 'file';
	})();
	return backendPromise;
}

/**
 * Remove the proxy password, keeping any sibling field like `groups` and dropping `proxy`
 * entirely when the secret was all it carried.
 */
export function stripProxyPassword(data: { proxy?: { password?: string } }) {
	if (!data.proxy) return;

	delete data.proxy.password;
	if (Object.keys(data.proxy).length === 0) delete data.proxy;
}

async function getKeyringEntry({ service, account }: KeyringKey): Promise<KeyringEntry | null> {
	const mod = await loadKeyringModule();
	if (!mod) return null;
	return new mod.Entry(service, account);
}

async function readKeyring(key: KeyringKey): Promise<string | undefined> {
	try {
		const entry = await getKeyringEntry(key);
		if (!entry) return undefined;
		return entry.getPassword() ?? undefined;
	} catch (err) {
		cliDebugPrint('credentials', `failed to read ${key.service}/${key.account} from keyring`, err);
		return undefined;
	}
}

async function writeKeyring(key: KeyringKey, value: string): Promise<void> {
	const entry = await getKeyringEntry(key);
	if (!entry) {
		throw new Error('OS keyring is not available.');
	}
	entry.setPassword(value);
}

/**
 * Returns the secret this left in the keyring, or null. Callers that cannot act on it ignore it.
 *
 * Only a secret that still reads back is reported. The module loads on machines with no secret
 * service, where every entry throws although nothing was ever stored, and a caller acting on that
 * would name a keyring the user does not have. A keyring that can neither delete nor read is
 * silent for the same reason, which is the cost of not naming one that was never there.
 */
async function deleteKeyring(key: KeyringKey): Promise<KeyringLeftover | null> {
	try {
		const entry = await getKeyringEntry(key);
		if (!entry) return null;
		entry.deletePassword();
		return null;
	} catch (err) {
		cliDebugPrint('credentials', `failed to delete ${key.service}/${key.account} from keyring`, err);
		return (await readKeyring(key)) === undefined ? null : { key, error: err };
	}
}

/**
 * Where one account's secrets live. A token in `auth.json` means the file, and the account's other
 * secrets are moved there with it; otherwise the keyring, unless it is disabled or unavailable.
 * Decided by the token alone, so a keyring account never looks up a proxy password in the file
 * first.
 */
export async function backendFor(userId: string): Promise<CredentialsBackend> {
	if (readProfileSecret(userId, 'token') !== undefined) return 'file';
	return getBackend();
}

/**
 * One account's secret of the given kind, from whichever backend holds it. A keyring miss falls
 * back to the file, where a secret lands when its own keyring write failed after the token's
 * succeeded.
 */
export async function getSecret(userId: string, kind: SecretKind): Promise<string | undefined> {
	if ((await backendFor(userId)) === 'keyring') {
		return (await readKeyring(keyringKey(userId, kind))) ?? readProfileSecret(userId, kind);
	}
	return readProfileSecret(userId, kind);
}

/**
 * Persist one account's secret. A token goes wherever {@link getBackend} says now, so a re-login
 * moves an account back to the keyring once it works again; the other secrets follow the token.
 * When `skipIfUnchanged` is true and the stored value already matches in that place, the write is
 * skipped. This avoids macOS Keychain prompts on every command.
 */
export async function setSecret(
	userId: string,
	kind: SecretKind,
	value: string,
	opts: { skipIfUnchanged?: boolean } = {},
): Promise<void> {
	const current = await backendFor(userId);
	const target = kind === 'token' ? await getBackend() : current;
	if (opts.skipIfUnchanged && current === target && (await getSecret(userId, kind)) === value) return;

	if (target === 'keyring') {
		try {
			await writeKeyring(keyringKey(userId, kind), value);
			// The file copies are what would send reads there, so they go once the keyring holds the token.
			if (kind === 'token') clearProfileFileSecrets(userId);
			return;
		} catch (err) {
			cliDebugPrint('credentials', 'keyring write failed; falling back to file', err);
			// The token is about to land in the file, which is where reads go from now on. The rest
			// follow it, or the keyring copies become unreachable.
			if (kind === 'token') await moveKeyringSecretsToFile(userId);
		}
	}

	writeProfileSecret(userId, kind, value);
}

/** Every secret but the token, which the caller writes next. */
async function moveKeyringSecretsToFile(userId: string): Promise<void> {
	for (const kind of SECRET_KINDS) {
		if (kind === 'token') continue;

		const value = await readKeyring(keyringKey(userId, kind));
		if (value === undefined) continue;

		writeProfileSecret(userId, kind, value);
		if (readProfileSecret(userId, kind) === value) await deleteKeyring(keyringKey(userId, kind));
	}
}

/**
 * Forget one of an account's secrets. Called for a proxy password when the account has none, so
 * the previous account's does not survive a re-login — the keyring outlives the auth.json rewrite
 * that replaces everything else.
 *
 * Returns the secret this left behind, or null. A refused delete here is the one that matters
 * most: the stored value stays, and reads keep serving it as the account's own.
 */
export async function deleteSecret(userId: string, kind: SecretKind): Promise<KeyringLeftover | null> {
	const leftover = (await backendFor(userId)) === 'keyring' ? await deleteKeyring(keyringKey(userId, kind)) : null;
	deleteProfileSecret(userId, kind);
	return leftover;
}

/**
 * Remove one profile's keyring entries, plus the fixed-name entries used before secrets were keyed
 * by user. Always attempts the keyring deletes even when the current backend is `file`, so toggling
 * `APIFY_DISABLE_KEYRING=1` between login and logout does not orphan entries the user has no
 * in-CLI way to discover.
 *
 * The CLI never enumerates the keyring, so `auth.json` is its only index of what it holds. Call
 * this before the profile leaves the file, or the CLI loses the names of its entries. Secrets
 * stored in `auth.json` itself go with the profile that holds them.
 *
 * `findCredentials()` could enumerate a service on every platform but the Linux keyutils
 * fallback, so a repair path is open if one is ever needed.
 *
 * Returns the entries the keyring refused to delete, so a caller can name them. Every key is
 * attempted first: one entry the keyring holds on to must not strand the rest.
 */
export async function clearKeyringSecrets(userId?: string): Promise<KeyringLeftover[]> {
	const leftovers: (KeyringLeftover | null)[] = [];

	for (const kind of SECRET_KINDS) {
		if (userId) leftovers.push(await deleteKeyring(keyringKey(userId, kind)));
		leftovers.push(await deleteKeyring(legacyKeyringKey(kind)));
	}

	return leftovers.filter((leftover) => leftover !== null);
}

/** Names the entries a failed logout or login left behind, in the words the keyring app shows. */
export function describeLeftovers(leftovers: KeyringLeftover[]): string {
	return leftovers.map(({ key }) => `${key.service}/${key.account}`).join(', ');
}

/** The reasons behind {@link describeLeftovers}, each said once however many entries share it. */
export function leftoverReasons(leftovers: KeyringLeftover[]): string {
	const reasons = leftovers.map(({ error }) => (error instanceof Error ? error.message : String(error)));
	return [...new Set(reasons)].join(' ');
}

/**
 * Moves plaintext secrets at the top level of a v1 auth.json into the keyring.
 *
 * - No top-level secret means there is nothing to do, which makes re-entry a no-op.
 * - On the `file` backend, or when the keyring write fails, the secrets stay where they are, and
 *   `ensureSecretsKeyed()` moves them into the profile, after which this has nothing to do.
 * - A `secretsBackend` marker from an older CLI is ignored and dropped by the shape migration.
 * - Wrapped in try/catch so a migration failure never blocks the CLI.
 */
export async function ensureMigrated(): Promise<void> {
	if (migrationPromise) return migrationPromise;
	migrationPromise = (async () => {
		try {
			const file = readAuthFile();
			// A file a newer CLI wrote is not ours to rewrite, and this runs before the shape
			// migration reports it.
			if (typeof file.version === 'number' && file.version > AUTH_FILE_VERSION) return;
			if (!file.token && !file.proxy?.password) return;
			if ((await getBackend()) === 'file') return;

			try {
				if (file.token) await writeKeyring(legacyKeyringKey('token'), file.token);
				if (file.proxy?.password) {
					await writeKeyring(legacyKeyringKey('proxy-password'), file.proxy.password);
				}
			} catch (err) {
				cliDebugPrint('credentials', 'keyring write failed during migration; keeping secrets in the file', err);
				return;
			}

			delete file.token;
			stripProxyPassword(file);
			writeAuthFile(file);
		} catch (err) {
			cliDebugPrint('credentials', 'migration failed', err);
		}
	})();
	return migrationPromise;
}

/**
 * Drops secrets there is no user ID to file under. That state already required a re-login — the
 * CLI has no account to attach the token to — so nothing reachable is lost.
 */
async function dropUnkeyedSecrets(file: AuthFile): Promise<void> {
	for (const kind of SECRET_KINDS) await deleteKeyring(legacyKeyringKey(kind));

	if (file.token === undefined && file.proxy === undefined) return;

	delete file.token;
	delete file.proxy;
	writeAuthFile(file);
}

/**
 * Write the new entry, verify it reads back, then delete the old one. The reverse order loses the
 * secret when the delete succeeds and the write does not. Nothing the account already has is
 * touched, so the migration never restores a value something newer replaced.
 */
async function keyKeyringSecrets(userId: string): Promise<void> {
	// A keyed token means a login already wrote this account's secrets under the new names. The
	// fixed names are then whatever a previous login left, which may be another account's, so
	// nothing under them is claimed for this one. Read once, and only once a fixed name turns
	// something up, which on a keyed account is never.
	let claimable: boolean | undefined;

	for (const kind of SECRET_KINDS) {
		const legacy = legacyKeyringKey(kind);
		const value = await readKeyring(legacy);
		if (value === undefined) continue;

		claimable ??= (await readKeyring(keyringKey(userId, 'token'))) === undefined;

		// The second test covers the kinds a login stores directly; the first covers the kinds it
		// leaves empty, which nothing else would tell apart from never having been set.
		if (!claimable || (await getSecret(userId, kind)) !== undefined) {
			await deleteKeyring(legacy);
			continue;
		}

		// A failure earlier in this loop put the token in the file, so the secrets after it belong
		// there too rather than under a keyring name nothing will read.
		if ((await backendFor(userId)) === 'keyring') {
			const target = keyringKey(userId, kind);

			try {
				await writeKeyring(target, value);
				if ((await readKeyring(target)) === value) await deleteKeyring(legacy);
				continue;
			} catch (err) {
				cliDebugPrint('credentials', 'keyring write failed while keying secrets by user', err);
			}
		}

		writeProfileSecret(userId, kind, value);
		if (readProfileSecret(userId, kind) === value) await deleteKeyring(legacy);
	}
}

/** One atomic write moves the secrets into the profile and clears the top level. */
function keyFileSecrets(userId: string, file: AuthFile): void {
	const profile = file.profiles?.[userId];
	if (!profile) return;

	const { token } = file;
	const proxyPassword = file.proxy?.password;
	if (token === undefined && proxyPassword === undefined) return;

	if (token !== undefined) profile.token = token;
	if (proxyPassword !== undefined) profile.proxy = { password: proxyPassword };

	delete file.token;
	delete file.proxy;
	writeAuthFile(file);
}

/**
 * Moves secrets off the fixed names they shared onto keys that carry the user ID, so a second
 * account cannot overwrite the first one's token.
 *
 * Runs after `ensureAuthFileCurrent()` — the user ID comes from the v2 file. A v2 file whose
 * secrets still sit under the old names is a supported state: every user is in it between the two
 * releases, and the two migrations stay independent.
 *
 * Idempotent, single-flight, and it never throws — a migration failure must not block a command.
 */
export async function ensureSecretsKeyed(): Promise<void> {
	keyingPromise ??= (async () => {
		try {
			const file = readAuthFile();
			if (file.version !== AUTH_FILE_VERSION) return;

			const userId = file.activeProfile;
			if (!userId) {
				await dropUnkeyedSecrets(file);
				return;
			}

			// Top-level secrets are already in the file, whichever backend is current, so they move into
			// the profile either way; that is also what stops a failed keyring move from being retried.
			keyFileSecrets(userId, file);
			if ((await backendFor(userId)) === 'keyring') await keyKeyringSecrets(userId);
		} catch (err) {
			cliDebugPrint('credentials', 'keying secrets by user failed', err);
		}
	})();

	return keyingPromise;
}

/**
 * Brings the stored credentials to their current form: the plaintext secrets into the keyring, the
 * file into its current shape, then the secrets onto keys that carry the user ID. The order is a
 * dependency chain — keying by user needs the user ID the shape migration produces.
 *
 * Every reader calls this before it reads. `loginWithToken()` does not: it replaces the file
 * wholesale, so there is nothing to bring forward, and it clears the old keyring names itself.
 *
 * Each step is single-flight and never throws, so repeat calls cost nothing.
 */
export async function ensureCredentialsCurrent(): Promise<void> {
	await ensureMigrated();
	await ensureAuthFileCurrent();
	await ensureSecretsKeyed();
}
