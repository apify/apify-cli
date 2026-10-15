import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import process from 'node:process';

import jju from 'jju';

import { useYesNoConfirm } from '../hooks/user-confirmations/useYesNoConfirm.js';
import { simpleLog } from '../outputs.js';
import { tildify } from '../utils.js';

interface ConfirmOverwriteOptions {
	filePath: string;
	entryKey: string;
	yes: boolean;
}

async function confirmOverwrite({ filePath, entryKey, yes }: ConfirmOverwriteOptions): Promise<boolean> {
	// Skip the existing-entry preview — it contains a bearer token we should not reprint.
	return useYesNoConfirm({
		message: `A server entry named '${entryKey}' already exists in ${tildify(filePath)}. Overwrite it?`,
		default: false,
		providedConfirmFromStdin: yes || undefined,
		errorMessageForStdin: `An '${entryKey}' entry already exists in ${tildify(filePath)}. Re-run with --yes to overwrite.`,
	});
}

/**
 * Insert or replace one entry in a JSONC config file.
 *
 * Uses `jju.update`, which re-renders the original text from its token stream — comments,
 * indentation, trailing commas, and unrelated keys all survive. Greenfield writes (missing
 * or empty file) go through `jju.stringify` so the output is properly indented instead of
 * the collapsed shape `jju.update` produces from a `{}` seed.
 *
 * Returns true if the file was written, false if the user declined the overwrite.
 */
export async function mergeServerEntry({
	filePath,
	topLevelKey,
	entryKey,
	serverEntry,
	yes,
}: {
	filePath: string;
	topLevelKey: string;
	entryKey: string;
	serverEntry: Record<string, unknown>;
	yes: boolean;
}): Promise<boolean> {
	const text = existsSync(filePath) ? await readFile(filePath, 'utf-8') : '';
	const trimmed = text.trim();

	let newText: string;
	if (!trimmed) {
		const document = { [topLevelKey]: { [entryKey]: serverEntry } };
		newText = `${jju.stringify(document, { mode: 'json', indent: 2 })}\n`;
	} else {
		let document: Record<string, unknown>;
		try {
			document = jju.parse(text) as Record<string, unknown>;
		} catch (err) {
			// jju's message embeds a code frame of the offending line, which may hold another server's token — keep only the position.
			const reason = err instanceof Error ? err.message.split('\n')[0] : 'invalid JSON';
			throw new Error(
				`Cannot install: ${tildify(filePath)} is not valid JSON (${reason}). Fix the file manually and re-run.`,
			);
		}

		if (typeof document !== 'object' || document === null || Array.isArray(document)) {
			throw new Error(`Cannot install: ${tildify(filePath)} is not a JSON object. Fix the file manually and re-run.`);
		}

		const existingTopLevel = document[topLevelKey];
		if (existingTopLevel != null && (typeof existingTopLevel !== 'object' || Array.isArray(existingTopLevel))) {
			throw new Error(
				`Cannot install: '${topLevelKey}' in ${tildify(filePath)} is not a JSON object. Fix the file manually and re-run.`,
			);
		}

		const topLevel = (existingTopLevel as Record<string, unknown> | undefined) ?? {};
		if (Object.prototype.hasOwnProperty.call(topLevel, entryKey)) {
			const ok = await confirmOverwrite({ filePath, entryKey, yes });
			if (!ok) {
				simpleLog({ message: 'No changes written.' });
				return false;
			}
		}
		topLevel[entryKey] = serverEntry;
		document[topLevelKey] = topLevel;

		newText = jju.update(text, document);
	}

	await mkdir(dirname(filePath), { recursive: true });
	// Write to a temp sibling and rename so a crash / ENOSPC mid-write can't leave the user's config half-written.
	const tmpPath = `${filePath}.${process.pid}.tmp`;
	try {
		await writeFile(tmpPath, newText, 'utf-8');
		await rename(tmpPath, filePath);
	} catch (err) {
		await rm(tmpPath, { force: true });
		throw err;
	}
	return true;
}

/**
 * Remove one entry from a JSONC config file's top-level key.
 * Returns true if the entry was found and removed, false if it was not present or the file did not exist.
 * Preserves all other content (comments, indentation, unrelated keys) via jju.update.
 */
export async function removeServerEntry({
	filePath,
	topLevelKey,
	entryKey,
}: {
	filePath: string;
	topLevelKey: string;
	entryKey: string;
}): Promise<boolean> {
	if (!existsSync(filePath)) return false;

	const text = await readFile(filePath, 'utf-8');
	if (!text.trim()) return false;

	let document: Record<string, unknown>;
	try {
		document = jju.parse(text) as Record<string, unknown>;
	} catch {
		return false;
	}

	const topLevel = document[topLevelKey];
	if (typeof topLevel !== 'object' || topLevel === null || Array.isArray(topLevel)) return false;

	const topLevelObj = topLevel as Record<string, unknown>;
	if (!Object.prototype.hasOwnProperty.call(topLevelObj, entryKey)) return false;

	delete topLevelObj[entryKey];
	document[topLevelKey] = topLevelObj;

	const newText = jju.update(text, document);
	const tmpPath = `${filePath}.${process.pid}.tmp`;
	try {
		await writeFile(tmpPath, newText, 'utf-8');
		await rename(tmpPath, filePath);
	} catch (err) {
		await rm(tmpPath, { force: true });
		throw err;
	}
	return true;
}
