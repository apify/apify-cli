import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

import { DOTENV_FILE_NAME } from '../consts.js';
import { ensureGitignoreEntries, getGitignoreMatcher, isTrackedByGit } from '../utils.js';
import { envFail } from './errors.js';

export interface DotEnvFile {
	path: string;
	exists: boolean;
	/** Empty when the file doesn't exist. */
	content: string;
	vars: Record<string, string>;
}

const parseDotEnv = (content: string) => ({ ...parseEnv(content) }) as Record<string, string>;

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

	// Editors on Windows can save a UTF-8 byte order mark, which parseEnv would keep as part of the first name.
	content = content.replace(/^\uFEFF/, '');

	return { path, exists: true, content, vars: parseDotEnv(content) };
}

/**
 * The value as it goes after `NAME=` in .env, so that parsing it gives the value back. Values that need it are quoted
 * with ' or `, which keep the value literal. Double quotes, which turn \n into a new line, are the last resort for a
 * value that contains both, and only when the value reads back the same. `name` only names the variable in the error.
 */
export function serializeDotEnvValue(name: string, value: string): string {
	const candidates = [
		...(/^[^\s#'"`]*$/.test(value) ? [value] : []),
		...(value.includes("'") ? [] : [`'${value}'`]),
		...(value.includes('`') ? [] : [`\`${value}\``]),
		...(value.includes('"') ? [] : [`"${value}"`]),
	];

	const serialized = candidates.find((candidate) => parseDotEnv(`K=${candidate}`).K === value);
	if (serialized === undefined) {
		envFail(
			candidates.length
				? `The value of ${name} can't be written to .env so that it reads back the same.`
				: `The value of ${name} can't be written to .env: it contains every quote character.`,
		);
	}

	return serialized;
}

const ASSIGNMENT = /^(\s*(?:export\s+)?)([^\s=#]+)\s*=/;
const QUOTES = ["'", '"', '`'];

/**
 * Sets `updates` in the content of a .env file. The last assignment of a key is replaced in place, and keys without one
 * are appended in the given order. Comments, blank lines, and the other lines stay as they are.
 */
export function updateDotEnvContent(content: string, updates: Record<string, string>): string {
	const eol = content.includes('\r\n') ? '\r\n' : '\n';
	// Each line keeps its line ending.
	const lines = content.match(/[^\n]*\n|[^\n]+$/g) ?? [];

	// The lines of the last assignment of each key: a quoted value without its closing quote spans to the line with it.
	const assignments = new Map<string, { start: number; end: number; prefix: string }>();
	for (let i = 0; i < lines.length; i++) {
		const match = lines[i].match(ASSIGNMENT);
		if (!match) continue;

		const start = i;
		const quote = lines[i].slice(match[0].length).trimStart()[0];
		if (QUOTES.includes(quote) && !lines[i].slice(lines[i].indexOf(quote, match[0].length) + 1).includes(quote)) {
			const end = lines.findIndex((line, j) => j > i && line.includes(quote));
			if (end !== -1) i = end;
		}

		assignments.set(match[2], { start, end: i, prefix: match[1] });
	}

	const replaced = new Map<number, string>();
	const appended: string[] = [];
	for (const [name, value] of Object.entries(updates)) {
		const line = `${name}=${serializeDotEnvValue(name, value)}`;
		const assignment = assignments.get(name);
		if (!assignment) {
			appended.push(`${line}${eol}`);
			continue;
		}

		const lineEnding = lines[assignment.end].match(/\r?\n$/)?.[0] ?? '';
		replaced.set(assignment.start, `${assignment.prefix}${line}${lineEnding}`);
		for (let j = assignment.start + 1; j <= assignment.end; j++) replaced.set(j, '');
	}

	let result = lines.map((line, i) => replaced.get(i) ?? line).join('');
	if (appended.length) {
		if (result && !result.endsWith('\n')) result += eol;
		result += appended.join('');
	}

	const expected = { ...parseDotEnv(content), ...updates };
	const actual = parseDotEnv(result);
	const same =
		Object.keys(actual).length === Object.keys(expected).length &&
		Object.entries(expected).every(([name, value]) => Object.hasOwn(actual, name) && actual[name] === value);
	if (!same) {
		envFail("Couldn't update .env without changing other lines. Edit it by hand.");
	}

	return result;
}

/** Fails when `.env` in the Actor directory is a directory, such as a Python virtual environment. */
export function checkDotEnvWritable(actorDir: string): void {
	const path = getDotEnvPath(actorDir);
	if (statSync(path, { throwIfNoEntry: false })?.isDirectory()) {
		envFail(
			`${path} is a directory, for example a Python virtual environment. Rename it, for example to .venv, to use a .env file.`,
		);
	}
}

/** Writes .env in the Actor directory. A new file is readable only by its owner; an existing one keeps its mode. */
export function writeDotEnv(actorDir: string, content: string): void {
	checkDotEnvWritable(actorDir);

	const path = getDotEnvPath(actorDir);
	try {
		writeFileSync(path, content, { mode: 0o600 });
	} catch (err) {
		envFail(`Couldn't write ${path}: ${(err as Error).message}`);
	}
}

/** True when ignore rules cover `.env` in the Actor directory, also when the file doesn't exist yet. */
export async function isDotEnvGitignored(actorDir: string): Promise<boolean> {
	// Naming .env makes the matcher ask git about it by name, so the answer holds for a .env that doesn't exist yet.
	const isIgnored = await getGitignoreMatcher(actorDir, [DOTENV_FILE_NAME]);
	return isIgnored(DOTENV_FILE_NAME);
}

/**
 * Adds `.env` to the Actor directory's .gitignore unless ignore rules already cover it. Call it before writing .env, so
 * the written file is never left unignored. `tracked` says whether Git already tracks .env, which .gitignore doesn't
 * change.
 */
export async function ensureDotEnvGitignored(actorDir: string): Promise<{ added: boolean; tracked: boolean }> {
	const added = (await isDotEnvGitignored(actorDir))
		? false
		: ensureGitignoreEntries(actorDir, [DOTENV_FILE_NAME]).length > 0;
	return { added, tracked: isTrackedByGit(actorDir, DOTENV_FILE_NAME) };
}
