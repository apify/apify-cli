import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

import { AUTH_FILE_PATH } from './consts.js';
import { ensureApifyDirectory } from './files.js';
import { useCLIMetadata } from './hooks/useCLIMetadata.js';
import { cliDebugPrint } from './utils/cliDebugPrint.js';

const KEYRING_SERVICE = 'com.apify.cli';
const TOKEN_ACCOUNT = 'token';
const PROXY_PASSWORD_ACCOUNT = 'proxy-password';
const OAUTH_REFRESH_TOKEN_ACCOUNT = 'oauth-refresh-token';

export type CredentialsBackend = 'keyring' | 'file';

/** Non-secret state of an OAuth login. Lives in auth.json on both backends. */
export interface OAuthMetadata {
	issuer: string;
	clientId: string;
	tokenEndpoint: string;
	/** Access token expiry, ms since epoch. */
	expiresAt: number;
	/** Refresh token expiry, ms since epoch, when the server reports one. */
	refreshTokenExpiresAt?: number;
}

interface KeyringEntry {
	getPassword(): string | null;
	setPassword(password: string): void;
	deletePassword(): boolean;
}

interface KeyringModule {
	Entry: new (service: string, account: string) => KeyringEntry;
}

interface StoredAuthFile {
	token?: string;
	proxy?: { password?: string; [k: string]: unknown };
	/** `refreshToken` is only present on the file backend. */
	oauth?: Partial<OAuthMetadata> & { refreshToken?: string };
	secretsBackend?: CredentialsBackend;
	[k: string]: unknown;
}

let cachedKeyringModule: KeyringModule | null | undefined;
let backendPromise: Promise<CredentialsBackend> | undefined;
let migrationPromise: Promise<void> | undefined;

/** Test-only: clear cached module/backend/migration so each test starts fresh. */
export function __resetCredentialsForTests() {
	cachedKeyringModule = undefined;
	backendPromise = undefined;
	migrationPromise = undefined;
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
 * No write-probe runs here: on macOS that would pop a keychain prompt before the user has
 * authorized one. The first real write is the probe — failure is caught and downgraded
 * via `downgradeBackendToFile()`, persisting the file marker so future runs skip the keyring.
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
 * Called when a keyring write fails at runtime. Flips the cached backend so subsequent
 * reads/writes use the file path immediately, without waiting for the marker on disk.
 */
function downgradeBackendToFile() {
	backendPromise = Promise.resolve('file');
}

function readAuthFile(): StoredAuthFile {
	if (!existsSync(AUTH_FILE_PATH())) return {};
	try {
		const raw = readFileSync(AUTH_FILE_PATH(), 'utf-8');
		return JSON.parse(raw) as StoredAuthFile;
	} catch {
		return {};
	}
}

function writeAuthFile(data: StoredAuthFile) {
	ensureApifyDirectory(AUTH_FILE_PATH());
	writeFileSync(AUTH_FILE_PATH(), JSON.stringify(data, null, '\t'), { mode: 0o600 });
}

async function getKeyringEntry(account: string): Promise<KeyringEntry | null> {
	const mod = await loadKeyringModule();
	if (!mod) return null;
	return new mod.Entry(KEYRING_SERVICE, account);
}

async function readKeyring(account: string): Promise<string | undefined> {
	try {
		const entry = await getKeyringEntry(account);
		if (!entry) return undefined;
		return entry.getPassword() ?? undefined;
	} catch (err) {
		cliDebugPrint('credentials', `failed to read ${account} from keyring`, err);
		return undefined;
	}
}

async function writeKeyring(account: string, value: string): Promise<void> {
	const entry = await getKeyringEntry(account);
	if (!entry) {
		throw new Error('OS keyring is not available.');
	}
	entry.setPassword(value);
}

async function deleteKeyring(account: string): Promise<void> {
	try {
		const entry = await getKeyringEntry(account);
		if (!entry) return;
		entry.deletePassword();
	} catch (err) {
		cliDebugPrint('credentials', `failed to delete ${account} from keyring`, err);
	}
}

export async function getToken(): Promise<string | undefined> {
	const backend = await getBackend();
	if (backend === 'keyring') return readKeyring(TOKEN_ACCOUNT);
	return readAuthFile().token;
}

export async function getProxyPassword(): Promise<string | undefined> {
	const backend = await getBackend();
	if (backend === 'keyring') return readKeyring(PROXY_PASSWORD_ACCOUNT);
	return readAuthFile().proxy?.password;
}

/**
 * Persist token. When `skipIfUnchanged` is true and the stored value already matches,
 * the write is skipped. This avoids macOS Keychain prompts on every command.
 */
export async function setToken(token: string, opts: { skipIfUnchanged?: boolean } = {}): Promise<void> {
	const backend = await getBackend();
	if (opts.skipIfUnchanged) {
		const existing = backend === 'keyring' ? await readKeyring(TOKEN_ACCOUNT) : readAuthFile().token;
		if (existing === token) return;
	}

	if (backend === 'keyring') {
		try {
			await writeKeyring(TOKEN_ACCOUNT, token);
			return;
		} catch (err) {
			cliDebugPrint('credentials', 'keyring write failed; falling back to file', err);
			downgradeBackendToFile();
		}
	}

	const data = readAuthFile();
	data.token = token;
	data.secretsBackend = 'file';
	writeAuthFile(data);
}

export async function setProxyPassword(password: string, opts: { skipIfUnchanged?: boolean } = {}): Promise<void> {
	const backend = await getBackend();
	if (opts.skipIfUnchanged) {
		const existing = backend === 'keyring' ? await readKeyring(PROXY_PASSWORD_ACCOUNT) : readAuthFile().proxy?.password;
		if (existing === password) return;
	}

	if (backend === 'keyring') {
		try {
			await writeKeyring(PROXY_PASSWORD_ACCOUNT, password);
			return;
		} catch (err) {
			cliDebugPrint('credentials', 'keyring write failed; falling back to file', err);
			downgradeBackendToFile();
		}
	}

	const data = readAuthFile();
	data.proxy = { ...data.proxy, password };
	data.secretsBackend = 'file';
	writeAuthFile(data);
}

export async function getOAuthRefreshToken(): Promise<string | undefined> {
	const backend = await getBackend();
	if (backend === 'keyring') return readKeyring(OAUTH_REFRESH_TOKEN_ACCOUNT);
	return readAuthFile().oauth?.refreshToken;
}

export async function setOAuthRefreshToken(
	refreshToken: string,
	opts: { skipIfUnchanged?: boolean } = {},
): Promise<void> {
	const backend = await getBackend();
	if (opts.skipIfUnchanged) {
		const existing =
			backend === 'keyring' ? await readKeyring(OAUTH_REFRESH_TOKEN_ACCOUNT) : readAuthFile().oauth?.refreshToken;
		if (existing === refreshToken) return;
	}

	if (backend === 'keyring') {
		try {
			await writeKeyring(OAUTH_REFRESH_TOKEN_ACCOUNT, refreshToken);
			return;
		} catch (err) {
			cliDebugPrint('credentials', 'keyring write failed; falling back to file', err);
			downgradeBackendToFile();
		}
	}

	const data = readAuthFile();
	data.oauth = { ...data.oauth, refreshToken };
	data.secretsBackend = 'file';
	writeAuthFile(data);
}

/** Reads the OAuth metadata from auth.json without touching the keyring. Never returns the refresh token. */
export function getOAuthMetadata(): OAuthMetadata | undefined {
	const { oauth } = readAuthFile();
	if (!oauth?.issuer || !oauth.clientId || !oauth.tokenEndpoint || typeof oauth.expiresAt !== 'number') {
		return undefined;
	}

	const { refreshToken: _refreshToken, ...metadata } = oauth;
	return metadata as OAuthMetadata;
}

/** Writes the OAuth metadata to auth.json, keeping an inline refresh token (file backend) in place. */
export function setOAuthMetadata(metadata: OAuthMetadata): void {
	const data = readAuthFile();
	const refreshToken = data.oauth?.refreshToken;
	data.oauth = refreshToken ? { ...metadata, refreshToken } : { ...metadata };
	writeAuthFile(data);
}

/** Forgets the OAuth session (refresh token and metadata) while leaving the access token in place. */
export async function clearOAuthState(): Promise<void> {
	await deleteKeyring(OAUTH_REFRESH_TOKEN_ACCOUNT);

	if (!existsSync(AUTH_FILE_PATH())) return;
	const data = readAuthFile();
	if (!data.oauth) return;
	delete data.oauth;
	writeAuthFile(data);
}

/**
 * Remove the token, proxy-password and OAuth refresh-token entries from the OS keyring. Always
 * attempts the keyring deletes even when the current backend is `file`, so toggling
 * `APIFY_DISABLE_KEYRING=1` between login and logout does not orphan entries the user
 * has no in-CLI way to discover. Plaintext secrets in `auth.json` are the caller's
 * responsibility (e.g. `logout` removes the whole file).
 */
export async function clearKeyringSecrets(): Promise<void> {
	await deleteKeyring(TOKEN_ACCOUNT);
	await deleteKeyring(PROXY_PASSWORD_ACCOUNT);
	await deleteKeyring(OAUTH_REFRESH_TOKEN_ACCOUNT);
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
			if (file.secretsBackend) return;
			if (!file.token && !file.proxy?.password) return;

			const backend = await getBackend();
			if (backend === 'file') {
				file.secretsBackend = 'file';
				writeAuthFile(file);
				return;
			}

			try {
				if (file.token) await writeKeyring(TOKEN_ACCOUNT, file.token);
				if (file.proxy?.password) await writeKeyring(PROXY_PASSWORD_ACCOUNT, file.proxy.password);
			} catch (err) {
				cliDebugPrint('credentials', 'keyring write failed during migration; falling back to file', err);
				downgradeBackendToFile();
				file.secretsBackend = 'file';
				writeAuthFile(file);
				return;
			}

			delete file.token;
			if (file.proxy) {
				delete file.proxy.password;
				// Drop the proxy object entirely when only the password lived there,
				// but keep it (minus the secret) when it carries other fields like `groups`.
				if (Object.keys(file.proxy).length === 0) delete file.proxy;
			}
			file.secretsBackend = 'keyring';
			writeAuthFile(file);
		} catch (err) {
			cliDebugPrint('credentials', 'migration failed', err);
		}
	})();
	return migrationPromise;
}
