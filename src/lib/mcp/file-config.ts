import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { useYesNoConfirm } from '../hooks/user-confirmations/useYesNoConfirm.js';
import { tildify } from '../utils.js';

// Client config files are user-editable, so we cannot rely on schema invariants. Surface a readable error instead of letting SyntaxError bubble up.
export async function readJsonConfig(filePath: string): Promise<Record<string, unknown>> {
	if (!existsSync(filePath)) return {};

	const raw = await readFile(filePath, 'utf-8');
	const trimmed = raw.trim();
	if (!trimmed) return {};

	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed);
	} catch (err) {
		if (err instanceof SyntaxError) {
			// VS Code's mcp.json supports JSONC (comments, trailing commas); plain JSON.parse cannot read those.
			const hint = /\/\/|\/\*/.test(trimmed)
				? ' The file appears to contain comments (JSONC); add the apify entry manually.'
				: '';
			throw new Error(`Cannot parse ${tildify(filePath)}: ${err.message}.${hint}`);
		}
		throw err;
	}

	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error(`${tildify(filePath)} is not a JSON object. Fix or remove the file and try again.`);
	}
	return parsed as Record<string, unknown>;
}

export async function writeJsonConfig(filePath: string, contents: Record<string, unknown>): Promise<void> {
	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(filePath, `${JSON.stringify(contents, null, 2)}\n`, 'utf-8');
}

interface ConfirmOverwriteOptions {
	filePath: string;
	entryKey: string;
	yes: boolean;
}

export async function confirmOverwrite({ filePath, entryKey, yes }: ConfirmOverwriteOptions): Promise<boolean> {
	// Skip the existing-entry preview — it contains a bearer token we should not reprint.
	return useYesNoConfirm({
		message: `A server entry named '${entryKey}' already exists in ${tildify(filePath)}. Overwrite it?`,
		default: false,
		providedConfirmFromStdin: yes || undefined,
		errorMessageForStdin: `An '${entryKey}' entry already exists in ${tildify(filePath)}. Re-run with --yes to overwrite.`,
	});
}
