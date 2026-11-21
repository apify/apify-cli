import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

export const DOTENV_FILE_NAME = '.env';

/**
 * Reads the `.env` file in `dir`. Returns `null` when there's no such file. A `.env` directory is often a Python
 * virtualenv, so it counts as no file.
 */
export const readDotEnv = async (dir: string): Promise<Record<string, string> | null> => {
	const path = join(dir, DOTENV_FILE_NAME);
	let content: string;

	try {
		content = await readFile(path, 'utf-8');
	} catch (err) {
		const { code } = err as NodeJS.ErrnoException;
		if (code === 'ENOENT' || code === 'EISDIR') return null;
		throw new Error(`Couldn't read ${path}: ${(err as Error).message}`);
	}

	return parseEnv(content) as Record<string, string>;
};
