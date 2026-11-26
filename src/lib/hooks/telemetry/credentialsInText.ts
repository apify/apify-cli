import process from 'node:process';

import { APIFY_ENV_VARS } from '@apify/consts';

import { listProfiles } from '../../auth-file.js';
import { ensureCredentialsCurrent, getSecret, SECRET_KINDS } from '../../credentials.js';
import { cliDebugPrint } from '../../utils/cliDebugPrint.js';

const MASK = '***';

/** Anything shorter is too likely to match ordinary text by accident. */
const MIN_STORED_SECRET_LENGTH = 8;

// Mirrors the MCP server's `maskAccessKeyTokens`: any `apify_<type>_` or `integration_api_token_` prefix
// followed by the secret. A look-alike word such as `apify_proxy_groups` doesn't match.
const PREFIXED_TOKEN_REGEX =
	/((?:apify(?:_[a-z]{1,16}){1,4}|integration_api_token)_)(?:(?!apify_|integration_api_token_)[a-zA-Z0-9]){20,36}/g;

// A value handed to something named like a credential: `--token abc…`, `?token=abc…`, `APIFY_TOKEN=abc…`,
// `"password": "abc…"`, `Bearer abc…`. Catches tokens that carry no prefix.
const KEYED_SECRET_REGEX =
	/((?:token|password|passwd|secret|api[_-]?key|bearer)["']?\s*(?:[=:]|\s)\s*["']?)([A-Za-z0-9_.~-]{16,})/gi;

/** A digit or mixed case, so a long word or a placeholder such as `YOUR_APIFY_TOKEN_HERE` isn't taken for a secret. */
function looksGenerated(value: string) {
	return /\d/.test(value) || (/[a-z]/.test(value) && /[A-Z]/.test(value));
}

/** Replaces every credential recognised by its shape with `***`. A prefixed token keeps its prefix. */
export function maskCredentials(text: string): string {
	return text
		.replace(PREFIXED_TOKEN_REGEX, `$1${MASK}`)
		.replace(KEYED_SECRET_REGEX, (match, key: string, value: string) =>
			looksGenerated(value) ? `${key}${MASK}` : match,
		);
}

/** {@link maskCredentials} for every string in a JSON-like value. */
export function maskCredentialsDeep<T>(value: T): T {
	if (typeof value === 'string') return maskCredentials(value) as T;
	if (Array.isArray(value)) return value.map(maskCredentialsDeep) as T;

	if (value && typeof value === 'object') {
		return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, maskCredentialsDeep(item)])) as T;
	}

	return value;
}

/**
 * Every credential this machine holds for the CLI: the ones in the environment and each stored account's.
 * These are matched verbatim, which is the only way to recognise a token that has no prefix.
 */
async function ownCredentials(): Promise<string[]> {
	const found: (string | undefined)[] = [process.env[APIFY_ENV_VARS.TOKEN], process.env[APIFY_ENV_VARS.PROXY_PASSWORD]];

	try {
		await ensureCredentialsCurrent();

		for (const { id } of listProfiles()) {
			for (const kind of SECRET_KINDS) found.push(await getSecret(id, kind));
		}
	} catch (error) {
		cliDebugPrint('credentialsInText', 'failed to read the stored credentials', error);
	}

	return found.map((value) => value?.trim() ?? '').filter((value) => value.length >= MIN_STORED_SECRET_LENGTH);
}

/** Whether the text holds one of this machine's own credentials or anything shaped like a token or password. */
export async function containsCredential(text: string): Promise<boolean> {
	if (maskCredentials(text) !== text) return true;

	return (await ownCredentials()).some((credential) => text.includes(credential));
}
