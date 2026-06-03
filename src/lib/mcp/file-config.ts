import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

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
		const document = jju.parse(text) as Record<string, unknown>;

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
	await writeFile(filePath, newText, 'utf-8');
	return true;
}
