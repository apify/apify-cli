import { isAbsolute } from 'node:path';
import process from 'node:process';

export function normalizeExecutablePath(path: string): string;
export function normalizeExecutablePath(path: string | null): string | null;
export function normalizeExecutablePath(path: string | null) {
	if (!path) {
		return null;
	}

	// Already escaped
	if (path.startsWith('"')) {
		return path;
	}

	if (process.platform === 'win32') {
		if (isAbsolute(path)) {
			return `"${path}"`;
		}

		return path;
	}

	return path;
}
