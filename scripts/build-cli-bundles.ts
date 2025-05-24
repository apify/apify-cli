/// <reference types="@types/bun" />

import { readFile, rm, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

import { $, fileURLToPath } from 'bun';

import { version } from '../package.json' with { type: 'json' };

const targets =
	process.platform === 'win32'
		? [
				//
				'bun-windows-x64',
			]
		: [
				//
				'bun-linux-x64',
				'bun-linux-arm64',
				'bun-darwin-x64',
				'bun-darwin-arm64',
				'bun-linux-x64-musl',
				'bun-linux-arm64-musl',
			];

const entryPoints = [
	//
	fileURLToPath(new URL('../src/entrypoints/apify.ts', import.meta.url)),
	fileURLToPath(new URL('../src/entrypoints/actor.ts', import.meta.url)),
];

await rm(new URL('../bundles/', import.meta.url), { recursive: true, force: true });

const metadataFile = new URL('../src/lib/hooks/useCLIMetadata.ts', import.meta.url);
const originalContent = await readFile(metadataFile, 'utf-8');

const newContent = originalContent.replace('process.env.APIFY_CLI_BUNDLE', 'true');

await writeFile(metadataFile, newContent);

for (const entryPoint of entryPoints) {
	const cliName = basename(entryPoint, '.ts');

	for (const target of targets) {
		const [, os, arch, musl] = target.split('-');

		const fileName = `${cliName}-${version}-${os}${musl ? '-musl' : ''}-${arch}`;

		const outFile = fileURLToPath(new URL(`../bundles/${fileName}`, import.meta.url));

		console.log(`Building ${cliName} for ${target} (result: ${fileName})...`);
		await $`bun build --compile --minify --sourcemap --target=${target} --outfile=${outFile} ${entryPoint}`;
	}
}

await writeFile(metadataFile, originalContent);
