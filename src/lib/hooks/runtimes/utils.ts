import { stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

import { ProjectLanguage, useCwdProject } from '../useCwdProject.js';

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

export async function getInstallCommandSuggestion(actFolderDir: string) {
	let installCommandSuggestion: string | null = null;

	const projectInfo = await useCwdProject({ cwd: actFolderDir });
	await projectInfo.inspectAsync(async (project) => {
		if (project.type === ProjectLanguage.JavaScript) {
			const [hasYarnLock, hasPnpmLock, hasBunLockb, hasBunLock] = await Promise.all([
				stat(join(actFolderDir, 'yarn.lock'))
					.then(() => true)
					.catch(() => false),
				stat(join(actFolderDir, 'pnpm-lock.yaml'))
					.then(() => true)
					.catch(() => false),
				stat(join(actFolderDir, 'bun.lockb'))
					.then(() => true)
					.catch(() => false),
				stat(join(actFolderDir, 'bun.lock'))
					.then(() => true)
					.catch(() => false),
			]);

			const hasAnyBunLock = hasBunLockb || hasBunLock;
			if (hasYarnLock) {
				installCommandSuggestion = 'yarn install';
			} else if (hasPnpmLock) {
				installCommandSuggestion = 'pnpm install';
			} else if (hasAnyBunLock) {
				installCommandSuggestion = 'bun install';
			} else if (project.runtime?.pmName === 'bun') {
				installCommandSuggestion = 'bun install';
			} else if (project.runtime?.pmName === 'deno') {
				installCommandSuggestion = 'deno install --node-modules-dir';
			} else {
				installCommandSuggestion = 'npm install';
			}
		} else if (project.type === ProjectLanguage.Python || project.type === ProjectLanguage.Scrapy) {
			installCommandSuggestion = 'python -m pip install -r requirements.txt';
		}
	});

	return installCommandSuggestion;
}
