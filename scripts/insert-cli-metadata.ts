import { readFile, writeFile } from 'node:fs/promises';

import { $ } from 'execa';

const tsFile = new URL('../src/lib/hooks/useCLIMetadata.ts', import.meta.url);
const pkgJsonFile = new URL('../package.json', import.meta.url);

const originalContent = await readFile(tsFile, 'utf-8');
const pkgJson = JSON.parse(await readFile(pkgJsonFile, 'utf-8')) as { version: string };

const { stdout: hash } = await $`git rev-parse HEAD`;

const newContent = originalContent
	.replaceAll('= DEVELOPMENT_VERSION_MARKER', `= ${JSON.stringify(pkgJson.version)}`)
	.replaceAll('= DEVELOPMENT_HASH_MARKER', `= ${JSON.stringify(hash)}`);

await writeFile(tsFile, newContent);
