import { realpathSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';

import { isOutside, toPosix } from './docker-context.js';

/** Excludes dangling links and links whose contents would escape the source tree. */
export function filterMonorepoFiles(root: string, files: string[]): string[] {
	return files.filter((file) => {
		try {
			return !isOutside(relative(root, realpathSync(join(root, file))));
		} catch {
			return false;
		}
	});
}

/** Hoists only the selected Actor's specification, leaving the source tree in place for Docker COPY. */
export async function flattenMonorepoUpload(
	actorDir: string,
	sourceRoot: string,
	files: string[],
	config: Record<string, unknown>,
) {
	const root = await mkdtemp(join(tmpdir(), 'apify-push-'));
	const dispose = async () => rm(root, { recursive: true, force: true });
	try {
		const specification = join(realpathSync(actorDir), '.actor');
		const paths = new Set<string>();
		const copy = async (file: string, destination: string) => {
			await mkdir(dirname(join(root, destination)), { recursive: true });
			await copyFile(join(sourceRoot, file), join(root, destination));
			paths.add(destination);
		};
		// A root Actor's specification must not leak into the selected Actor's hoisted specification.
		for (const file of files) {
			if (!file.startsWith('.actor/')) await copy(file, file);
		}
		for (const file of files) {
			const inSpecification = relative(specification, join(sourceRoot, file));
			if (!isOutside(inSpecification)) await copy(file, toPosix(join('.actor', inSpecification)));
		}

		const rewrite = (value: unknown, hoistSpecification = true) => {
			if (typeof value !== 'string' || value === '') return value;
			const absolute = resolve(specification, value);
			const inSpecification = relative(specification, absolute);
			if (hoistSpecification && !isOutside(inSpecification)) return value;
			return toPosix(relative(join(sourceRoot, '.actor'), absolute));
		};
		const rewritten = structuredClone(config);
		// Preserve the original Actor's fallback files instead of picking up a different root Actor's defaults.
		for (const [field, fileName] of [
			['dockerfile', 'Dockerfile'],
			['readme', 'README.md'],
			['changelog', 'CHANGELOG.md'],
			['input', 'INPUT_SCHEMA.json'],
		] as const) {
			if (rewritten[field] || (field === 'input' && rewritten.inputSchema)) continue;
			for (const directory of [specification, realpathSync(actorDir)]) {
				const entries = await readdir(directory);
				const name =
					entries.find((entry) => entry === fileName) ??
					entries.find((entry) => entry.toLowerCase() === fileName.toLowerCase());
				if (name && files.includes(toPosix(relative(sourceRoot, join(directory, name))))) {
					rewritten[field] = toPosix(relative(specification, join(directory, name)));
					break;
				}
			}
		}
		for (const field of [
			'dockerContextDir',
			'dockerfile',
			'readme',
			'changelog',
			'input',
			'inputSchema',
			'output',
			'outputSchema',
			'webServerSchema',
		]) {
			// A nested Docker context may not contain the hoisted specification, so keep its Dockerfile in place.
			if (field in rewritten) rewritten[field] = rewrite(rewritten[field], field !== 'dockerfile');
		}
		const storages = rewritten.storages as Record<string, unknown> | undefined;
		if (storages && typeof storages === 'object') {
			for (const field of ['keyValueStore', 'dataset']) {
				if (field in storages) storages[field] = rewrite(storages[field]);
			}
			if (storages.datasets && typeof storages.datasets === 'object') {
				for (const [name, value] of Object.entries(storages.datasets)) {
					(storages.datasets as Record<string, unknown>)[name] = rewrite(value);
				}
			}
		}
		await mkdir(join(root, '.actor'), { recursive: true });
		await writeFile(join(root, '.actor/actor.json'), JSON.stringify(rewritten, null, 2));
		paths.add('.actor/actor.json');
		return { root, files: [...paths], config: rewritten, [Symbol.asyncDispose]: dispose };
	} catch (err) {
		await dispose();
		throw err;
	}
}
