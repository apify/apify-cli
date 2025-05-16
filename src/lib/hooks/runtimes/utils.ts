import { isAbsolute } from 'node:path';

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

	// Regardless of platform, if there is a space in the path, we need to escape it
	if (isAbsolute(path) && path.includes(' ')) {
		return `"${path}"`;
	}

	return path;
}
