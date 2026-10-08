/** Reading `auth.json` in tests, so no test has to know the profile shape by hand. */

import { readFileSync } from 'node:fs';

import type { AuthFile, AuthProfile } from '../../src/lib/auth-file.js';
import { AUTH_FILE_PATH } from '../../src/lib/consts.js';

/** The raw file, for assertions about the version, the backend marker, or where secrets landed. */
export function readAuthFile(): AuthFile {
	return JSON.parse(readFileSync(AUTH_FILE_PATH(), 'utf-8')) as AuthFile;
}

/** The active profile with its user ID, read straight off disk rather than through the CLI. */
export function readActiveProfile(): (AuthProfile & { id: string }) | undefined {
	const { activeProfile, profiles } = readAuthFile();
	if (!activeProfile) return undefined;

	const profile = profiles?.[activeProfile];
	return profile ? { id: activeProfile, ...profile } : undefined;
}

/** A v1 `auth.json`, the shape every CLI before the profile migration wrote. */
export function v1AuthFile(overrides: Record<string, unknown> = {}) {
	return {
		id: 'uid',
		username: 'me',
		email: 'me@example.com',
		token: 'apify_api_v1_token',
		proxy: { password: 'pw', groups: [{ name: 'g' }] },
		plan: { id: 'FREE' },
		isPaying: false,
		createdAt: '2021-03-27T22:27:56.809Z',
		...overrides,
	};
}
