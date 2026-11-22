import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

import { DOTENV_FILE_NAME } from '../consts.js';
import { envFail } from './errors.js';

export interface DotEnvFile {
	path: string;
	exists: boolean;
	/** Empty when the file doesn't exist. */
	content: string;
	vars: Record<string, string>;
}

export function getDotEnvPath(actorDir: string): string {
	return join(actorDir, DOTENV_FILE_NAME);
}

/**
 * Reads `.env` from the Actor directory. Values are literal: `@secret` references aren't resolved.
 * A missing file, or a directory named `.env` (some Python projects use it for their virtual environment), counts as no `.env`.
 */
export function readDotEnv(actorDir: string): DotEnvFile {
	const path = getDotEnvPath(actorDir);

	let content: string;
	try {
		content = readFileSync(path, 'utf8');
	} catch (err) {
		const { code, message } = err as NodeJS.ErrnoException;
		if (code === 'ENOENT' || code === 'EISDIR') return { path, exists: false, content: '', vars: {} };
		envFail(`Couldn't read ${path}: ${message}`);
	}

	return { path, exists: true, content, vars: { ...parseEnv(content) } as Record<string, string> };
}
