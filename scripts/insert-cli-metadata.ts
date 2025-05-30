/*
CLI metadata (with the hook found in src/lib/hooks/useCLIMetadata.ts) stores constants about the CLI version that is used, for debugging purposes or commands
like upgrade, that will check if the CLI is up to date.

While we could embed this information in the package.json file, ideally we would not rely on reading from fs for it [or import statements for it]!
*/

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
