import process from 'node:process';

import type { AuthFile } from './auth-file.js';
import {
	AUTH_FILE_VERSION,
	deleteProfileSecret,
	moveProfileSecretToFile,
	readAuthFile,
	readProfileBackend,
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

interface KeyringKey {
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
 * Picks a backend the first time it's called and caches the result for the rest of the process.
 * Single-flight via a promise so concurrent callers share the same lookup.
 * Order: APIFY_DISABLE_KEYRING env override -> persisted marker in auth.json -> module load.
 *
 * This is the default every profile follows; a profile whose keyring write failed records its own
 * `secretsBackend` and reads through {@link backendFor} instead.
 *
 * No write-probe runs here: on macOS that would pop a keychain prompt before the user has
 * authorized one. The first real write is the probe, and a failure falls back to the file.
 */
export async function getBackend(): Promise<CredentialsBackend> {
	if (backendPromise) return backendPromise;
	backendPromise = (async (): Promise<CredentialsBackend> => {
		if (process.env.APIFY_DISABLE_KEYRING === '1') return 'file';

		const marker = readAuthFile().secretsBackend;
		if (marker === 'file') return 'file';
		const mod = await loadKeyringModule();
		return mod ? 'keyring' : 'file';
	})();
	return backendPromise;
}

/**
 * Called when a keyring write fails before any profile exists, so there is nothing to record the
 * fallback on but the file itself. Flips the cached backend so subsequent reads and writes use the
 * file path immediately, without waiting for the marker on disk.
 */
function downgradeBackendToFile() {
	backendPromise = Promise.resolve('file');
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

async function deleteKeyring(key: KeyringKey): Promise<void> {
	try {
		const entry = await getKeyringEntry(key);
		if (!entry) return;
		entry.deletePassword();
	} catch (err) {
		cliDebugPrint('credentials', `failed to delete ${key.service}/${key.account} from keyring`, err);
	}
}

/**
 * Where one account's secrets live. A profile that fell back to the file after a keyring failure
 * says so itself; every other profile follows the file-level choice.
 */
async function backendFor(userId: string): Promise<CredentialsBackend> {
	return readProfileBackend(userId) ?? (await getBackend());
}

/** One account's secret of the given kind, from whichever backend holds it. */
export async function getSecret(userId: string, kind: SecretKind): Promise<string | undefined> {
	if ((await backendFor(userId)) === 'keyring') return readKeyring(keyringKey(userId, kind));
	return readProfileSecret(userId, kind);
}

/**
 * Persist one account's secret. When `skipIfUnchanged` is true and the stored value already
 * matches, the write is skipped. This avoids macOS Keychain prompts on every command.
 */
export async function setSecret(
	userId: string,
	kind: SecretKind,
	value: string,
	opts: { skipIfUnchanged?: boolean } = {},
): Promise<void> {
	const backend = await backendFor(userId);
	if (opts.skipIfUnchanged && (await getSecret(userId, kind)) === value) return;

	if (backend === 'keyring') {
		try {
			await writeKeyring(keyringKey(userId, kind), value);
			return;
		} catch (err) {
			// Recorded on the profile rather than on the file, so an account whose secrets are in
			// the keyring is not redirected to a file that does not hold them.
			cliDebugPrint('credentials', 'keyring write failed; falling back to file', err);
			moveProfileSecretToFile(userId, kind, value);
			return;
		}
	}

	writeProfileSecret(userId, kind, value);
}

/**
 * Forget one of an account's secrets. Called for a proxy password when the account has none, so
 * the previous account's does not survive a re-login — the keyring outlives the auth.json rewrite
 * that replaces everything else.
 */
export async function deleteSecret(userId: string, kind: SecretKind): Promise<void> {
	if ((await backendFor(userId)) === 'keyring') {
		await deleteKeyring(keyringKey(userId, kind));
		return;
	}

	deleteProfileSecret(userId, kind);
}

/**
 * Remove one profile's keyring entries, plus the fixed-name entries used before secrets were keyed
 * by user. Always attempts the keyring deletes even when the current backend is `file`, so toggling
 * `APIFY_DISABLE_KEYRING=1` between login and logout does not orphan entries the user has no
 * in-CLI way to discover.
 *
 * The keyring has no listing API, so `auth.json` is the only index of what it holds. Call this
 * before the profile leaves the file, or its entries become unreachable. Secrets stored in
 * `auth.json` itself go with the profile that holds them.
 */
export async function clearKeyringSecrets(userId?: string): Promise<void> {
	for (const kind of SECRET_KINDS) {
		if (userId) await deleteKeyring(keyringKey(userId, kind));
		await deleteKeyring(legacyKeyringKey(kind));
	}
}

/**
 * One-shot, idempotent migration of legacy plaintext auth.json to the keyring.
 *
 * Both the API token and the proxy password are moved into the keyring on the keyring backend.
 *
 * - `secretsBackend` marker in auth.json makes re-entry a no-op.
 * - On `file` backend the marker is written but secrets stay in auth.json.
 * - On `keyring` backend the token and proxy password are moved out of auth.json.
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
			if (file.secretsBackend) return;
			if (!file.token && !file.proxy?.password) return;

			const backend = await getBackend();
			if (backend === 'file') {
				file.secretsBackend = 'file';
				writeAuthFile(file);
				return;
			}

			try {
				if (file.token) await writeKeyring(legacyKeyringKey('token'), file.token);
				if (file.proxy?.password) {
					await writeKeyring(legacyKeyringKey('proxy-password'), file.proxy.password);
				}
			} catch (err) {
				cliDebugPrint('credentials', 'keyring write failed during migration; falling back to file', err);
				downgradeBackendToFile();
				file.secretsBackend = 'file';
				writeAuthFile(file);
				return;
			}

			delete file.token;
			stripProxyPassword(file);
			file.secretsBackend = 'keyring';
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
 * secret when the delete succeeds and the write does not.
 */
async function keyKeyringSecrets(userId: string): Promise<void> {
	for (const kind of SECRET_KINDS) {
		const legacy = legacyKeyringKey(kind);
		const value = await readKeyring(legacy);
		if (value === undefined) continue;

		// A failure earlier in this loop moved this profile to the file, so the secrets after it
		// belong there too rather than under a keyring name nothing will read.
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

		moveProfileSecretToFile(userId, kind, value);
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

	// The file-level marker already says `file`: nothing else puts secrets at the top level.
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

			if ((await backendFor(userId)) === 'keyring') {
				await keyKeyringSecrets(userId);
				return;
			}

			keyFileSecrets(userId, file);
		} catch (err) {
			cliDebugPrint('credentials', 'keying secrets by user failed', err);
		}
	})();

	return keyingPromise;
}
