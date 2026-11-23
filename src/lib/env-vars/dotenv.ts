import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DOTENV_FILE_NAME } from '../consts.js';
import { envFail } from './errors.js';

export interface DotEnvFile {
	path: string;
	exists: boolean;
	/** Empty when the file doesn't exist. */
	content: string;
	vars: Record<string, string>;
}

const QUOTES = ['"', "'", '`'];

const trimSpaces = (text: string) => text.replace(/^[ \t]+|[ \t]+$/g, '');

/**
 * Parses .env content like `util.parseEnv` on Node.js 22.16 and later, on every Node.js version: on 22.1 to 22.15 and
 * 23, `util.parseEnv` turns a line without `=`, an indented comment, or `=` in a last-line value into wrong variables.
 * Unlike `util.parseEnv`, a line without a name is skipped, a value of only spaces is empty instead of taking the next
 * line, `export NAME=` sets `NAME`, and an indented comment is always a comment.
 */
export function parseDotEnv(content: string): Record<string, string> {
	const lines = content.replaceAll('\r', '').split('\n');
	const vars: Record<string, string> = {};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmed = trimSpaces(line);
		if (!trimmed || trimmed.startsWith('#')) continue;

		const equals = line.indexOf('=');
		if (equals === -1) continue;

		const name = trimSpaces(line.slice(0, equals)).replace(/^export[ \t]+/, '');
		const raw = line.slice(equals + 1).replace(/^[ \t]+/, '');
		const quote = raw[0];

		let value = trimSpaces(raw.split('#')[0]);
		if (QUOTES.includes(quote)) {
			// A quoted value runs to the closing quote, also on a later line, and the rest of that line is ignored.
			// Without a closing quote, the value is the rest of the line as it is.
			const rest = [raw.slice(1), ...lines.slice(i + 1)].join('\n');
			const end = rest.indexOf(quote);
			if (end === -1) {
				value = trimSpaces(raw);
			} else {
				value = rest.slice(0, end);
				i += value.split('\n').length - 1;
				if (quote === '"') value = value.replaceAll('\\n', '\n');
			}
		}

		if (name) vars[name] = value;
	}

	return vars;
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

	// Editors on Windows can save a UTF-8 byte order mark, which would otherwise become part of the first name.
	content = content.replace(/^\uFEFF/, '');

	return { path, exists: true, content, vars: parseDotEnv(content) };
}
