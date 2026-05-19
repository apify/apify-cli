import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

import { AUTH_FILE_PATH } from './consts.js';
import { ensureApifyDirectory } from './utils.js';
import { cliDebugPrint } from './utils/cliDebugPrint.js';

const KEYRING_SERVICE = 'com.apify.cli';
const TOKEN_ACCOUNT = 'token';
const PROXY_PASSWORD_ACCOUNT = 'proxy-password';
const PROBE_ACCOUNT = '__probe__';

export type CredentialsBackend = 'keyring' | 'file';

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
	proxy?: { password: string };
	secretsBackend?: CredentialsBackend;
	[k: string]: unknown;
}

let cachedKeyringModule: KeyringModule | null | undefined;
let cachedBackend: CredentialsBackend | undefined;
let migrationPromise: Promise<void> | undefined;

/** Test-only: clear cached module/backend/migration so each test starts fresh. */
export function __resetCredentialsForTests() {
	cachedKeyringModule = undefined;
	cachedBackend = undefined;
	migrationPromise = undefined;
}

async function loadKeyringModule(): Promise<KeyringModule | null> {
	if (cachedKeyringModule !== undefined) return cachedKeyringModule;
	try {
		// Indirect specifier so tsc doesn't try to resolve the module at compile time.
		const specifier = '@napi-rs/keyring';
		cachedKeyringModule = (await import(specifier)) as KeyringModule;
	} catch (err) {
		cliDebugPrint('credentials', 'failed to load @napi-rs/keyring', err);
		cachedKeyringModule = null;
	}
	return cachedKeyringModule;
}

function probeKeyring(mod: KeyringModule): boolean {
	try {
		const entry = new mod.Entry(KEYRING_SERVICE, PROBE_ACCOUNT);
		entry.setPassword('1');
		entry.getPassword();
		entry.deletePassword();
		return true;
	} catch (err) {
		cliDebugPrint('credentials', 'keyring probe failed', err);
		return false;
	}
}

/**
 * Picks a backend the first time it's called and caches the result for the rest of the process.
 * Order: APIFY_DISABLE_KEYRING env override -> module load -> runtime probe.
 */
export async function getBackend(): Promise<CredentialsBackend> {
	if (cachedBackend) return cachedBackend;

	if (process.env.APIFY_DISABLE_KEYRING === '1') {
		cachedBackend = 'file';
		return cachedBackend;
	}

	const mod = await loadKeyringModule();
	if (!mod) {
		cachedBackend = 'file';
		return cachedBackend;
	}

	cachedBackend = probeKeyring(mod) ? 'keyring' : 'file';
	return cachedBackend;
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
	writeFileSync(AUTH_FILE_PATH(), JSON.stringify(data, null, '\t'));
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
		await writeKeyring(TOKEN_ACCOUNT, token);
		return;
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
		await writeKeyring(PROXY_PASSWORD_ACCOUNT, password);
		return;
	}

	const data = readAuthFile();
	data.proxy = { password };
	data.secretsBackend = 'file';
	writeAuthFile(data);
}

/** Remove all stored secrets from the active backend. */
export async function clearSecrets(): Promise<void> {
	const backend = await getBackend();
	if (backend === 'keyring') {
		await deleteKeyring(TOKEN_ACCOUNT);
		await deleteKeyring(PROXY_PASSWORD_ACCOUNT);
	}
}

/**
 * One-shot, idempotent migration of legacy plaintext auth.json to the keyring.
 *
 * - `secretsBackend` marker in auth.json makes re-entry a no-op.
 * - On `file` backend the marker is written but secrets stay where they are.
 * - On `keyring` backend secrets are moved out of auth.json.
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

			if (file.token) await writeKeyring(TOKEN_ACCOUNT, file.token);
			if (file.proxy?.password) await writeKeyring(PROXY_PASSWORD_ACCOUNT, file.proxy.password);

			delete file.token;
			delete file.proxy;
			file.secretsBackend = 'keyring';
			writeAuthFile(file);
		} catch (err) {
			cliDebugPrint('credentials', 'migration failed', err);
		}
	})();
	return migrationPromise;
}
