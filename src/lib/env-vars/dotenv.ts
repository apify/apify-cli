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
	/** 1-based numbers of the lines that aren't a `NAME=value` assignment with a valid name. They aren't in `vars`. */
	malformedLines: number[];
}

const VALID_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const QUOTES = ['"', "'", '`'];

const isSpace = (char: string) => char === ' ' || char === '\t';

/** Trims spaces and tabs with a loop: a regex for the end retries every run of spaces inside the text, which is quadratic. */
const trimSpaces = (text: string) => {
	let start = 0;
	let end = text.length;
	while (start < end && isSpace(text[start])) start++;
	while (end > start && isSpace(text[end - 1])) end--;
	return text.slice(start, end);
};

/**
 * Parses .env content like `util.parseEnv` on Node.js 22.16 and later, on every Node.js version: on 22.1 to 22.15 and
 * 23, `util.parseEnv` turns a line without `=`, an indented comment, or `=` in a last-line value into wrong variables.
 * Unlike `util.parseEnv`, a value of only spaces is empty instead of taking the next line, `export NAME=` sets `NAME`,
 * and an indented comment is always a comment. A line that isn't `NAME=value` with a valid env var name isn't in
 * `vars`: only its number is kept, so its content is never printed.
 */
export function parseDotEnv(content: string): Pick<DotEnvFile, 'vars' | 'malformedLines'> {
	const lines = content.replaceAll('\r', '').split('\n');
	const vars: Record<string, string> = {};
	const malformedLines: number[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmed = trimSpaces(line);
		if (!trimmed || trimmed.startsWith('#')) continue;

		const lineNumber = i + 1;
		const equals = line.indexOf('=');
		if (equals === -1) {
			malformedLines.push(lineNumber);
			continue;
		}

		const name = trimSpaces(line.slice(0, equals)).replace(/^export[ \t]+/, '');
		const raw = line.slice(equals + 1).replace(/^[ \t]+/, '');
		const quote = raw[0];

		let value = trimSpaces(raw.split('#')[0]);
		if (QUOTES.includes(quote)) {
			// A quoted value runs to the closing quote, also on a later line, and the rest of that line is ignored.
			// Without a closing quote, the value is the rest of the line, quote included.
			const valueLines = [raw.slice(1)];
			let end = valueLines[0].indexOf(quote);
			for (let next = i + 1; end === -1 && next < lines.length; next++) {
				valueLines.push(lines[next]);
				end = lines[next].indexOf(quote);
			}
			if (end === -1) {
				value = trimSpaces(raw);
			} else {
				const last = valueLines.length - 1;
				valueLines[last] = valueLines[last].slice(0, end);
				value = valueLines.join('\n');
				i += valueLines.length - 1;
				if (quote === '"') value = value.replaceAll('\\n', '\n');
			}
		}

		if (VALID_NAME.test(name)) vars[name] = value;
		else malformedLines.push(lineNumber);
	}

	return { vars, malformedLines };
}

/** A warning that names the malformed lines of .env by number, or undefined when there are none. */
export function describeMalformedLines({
	path,
	malformedLines,
}: Pick<DotEnvFile, 'path' | 'malformedLines'>): string | undefined {
	if (!malformedLines.length) return undefined;

	const lines = malformedLines.length === 1 ? 'line' : 'lines';
	return `Skipped ${malformedLines.length} malformed ${lines} in ${path} (${lines} ${malformedLines.join(', ')}).`;
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
		if (code === 'ENOENT' || code === 'EISDIR')
			return { path, exists: false, content: '', vars: {}, malformedLines: [] };
		envFail(`Couldn't read ${path} (${code ?? message}).`);
	}

	// Editors on Windows can save a UTF-8 byte order mark, which would otherwise become part of the first name.
	content = content.replace(/^\uFEFF/, '');

	return { path, exists: true, content, ...parseDotEnv(content) };
}
