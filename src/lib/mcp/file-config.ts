import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { applyEdits, findNodeAtLocation, modify, parseTree } from 'jsonc-parser';

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
 * Surgically insert or replace one entry in a JSONC config file.
 * Uses jsonc-parser's edit API, which patches the source text in place — comments, indentation,
 * trailing commas, and unrelated keys all survive untouched. Falls back gracefully when the file
 * is missing or empty (a fresh object is created).
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
	const root = text.trim() ? parseTree(text) : undefined;

	if (root) {
		const topLevelNode = findNodeAtLocation(root, [topLevelKey]);
		if (topLevelNode && topLevelNode.type !== 'object') {
			throw new Error(
				`Cannot install: '${topLevelKey}' in ${tildify(filePath)} is not a JSON object. Fix the file manually and re-run.`,
			);
		}
		if (findNodeAtLocation(root, [topLevelKey, entryKey])) {
			const ok = await confirmOverwrite({ filePath, entryKey, yes });
			if (!ok) {
				simpleLog({ message: 'No changes written.' });
				return false;
			}
		}
	}

	const edits = modify(text, [topLevelKey, entryKey], serverEntry, {
		formattingOptions: { tabSize: 2, insertSpaces: true },
	});
	const newText = applyEdits(text, edits);

	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(filePath, newText, 'utf-8');
	return true;
}
