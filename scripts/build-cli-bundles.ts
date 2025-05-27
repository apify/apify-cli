/// <reference types="@types/bun" />

import { readFile, rm, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

import { $, fileURLToPath } from 'bun';

import { version } from '../package.json' with { type: 'json' };

const targets = (() => {
	if (process.env.APIFY_FULL_CLI_BUNDLES) {
		return [
			//
			'bun-windows-x64',
			'bun-windows-x64-baseline',
			'bun-linux-x64',
			'bun-linux-x64-baseline',
			'bun-linux-arm64',
			'bun-linux-arm64-baseline',
			'bun-darwin-x64',
			'bun-darwin-x64-baseline',
			'bun-darwin-arm64',
			'bun-darwin-arm64-baseline',
			'bun-linux-x64-musl',
			'bun-linux-arm64-musl',
			'bun-linux-x64-musl-baseline',
			'bun-linux-arm64-musl-baseline',
		];
	}

	if (process.platform === 'win32') {
		return ['bun-windows-x64', 'bun-windows-x64-baseline'];
	}

	return [
		'bun-linux-x64',
		'bun-linux-x64-baseline',
		'bun-linux-arm64',
		'bun-linux-arm64-baseline',
		'bun-darwin-x64',
		'bun-darwin-x64-baseline',
		'bun-darwin-arm64',
		'bun-darwin-arm64-baseline',
		'bun-linux-x64-musl',
		'bun-linux-arm64-musl',
		'bun-linux-x64-musl-baseline',
		'bun-linux-arm64-musl-baseline',
	];
})();

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
		// eslint-disable-next-line prefer-const -- somehow it cannot tell that os and arch cannot be "const" while the rest are let
		let [, os, arch, musl, baseline] = target.split('-');

		if (musl === 'baseline') {
			musl = '';
			baseline = 'baseline';
		}

		const fileName = `${cliName}-${version}-${os}-${arch}${musl ? '-musl' : ''}${baseline ? '-baseline' : ''}`;

		const outFile = fileURLToPath(new URL(`../bundles/${fileName}`, import.meta.url));

		console.log(`Building ${cliName} for ${target} (result: ${fileName})...`);
		// TODO: --sourcemap crashes for w/e reason and --bytecode doesn't support ESM (TLA to be exact)
		await $`bun build --compile --minify --target=${target} --outfile=${outFile} ${entryPoint}`;
	}
}

await writeFile(metadataFile, originalContent);
