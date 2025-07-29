/// <reference types="@types/bun" />

/*
This script is responsible for creating the CLI bundles (one file that embeds runtime with the CLI code, that can be just downloaded and ran).

At the time of writing (~2025-05-31), the bundles are created using Bun as the runtime and the targets you can see in the code.
When node stabilizes SEA (https://nodejs.org/api/single-executable-applications.html) [and supports ESM -.-], this code can be adapted to build it using that instead (but cross-platform will be a CI experience)
*/

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

// #region Inject the fact the CLI is ran in a bundle, instead of installed through npm/volta

const metadataFile = new URL('../src/lib/hooks/useCLIMetadata.ts', import.meta.url);
const originalContent = await readFile(metadataFile, 'utf-8');

const newContent = originalContent.replace('process.env.APIFY_CLI_BUNDLE', 'true');

await writeFile(metadataFile, newContent);

// #endregion

for (const entryPoint of entryPoints) {
	const cliName = basename(entryPoint, '.ts');

	for (const target of targets) {
		// eslint-disable-next-line prefer-const -- somehow it cannot tell that os and arch cannot be "const" while the rest are let
		let [, os, arch, musl, baseline] = target.split('-');

		if (musl === 'baseline') {
			musl = '';
			baseline = 'baseline';
		}

		// If we are building on Windows ARM64, even though the target is x64, we mark it as "arm64" (there are some weird errors when compiling on x64
		// and running on arm64). Hopefully bun will get arm64 native builds
		if (os === 'windows' && process.platform === 'win32') {
			const systemType = await $`pwsh -c "(Get-CimInstance Win32_ComputerSystem).SystemType"`.text();

			if (systemType.toLowerCase().includes('arm')) {
				arch = 'arm64';

				// On arm, process.arch will still return x64, which will break the upgrade command.
				// So we override the arch to arm64

				const newNewContent = newContent.replace('process.env.APIFY_BUNDLE_ARCH', '"arm64"');

				await writeFile(metadataFile, newNewContent);
			}
		}

		const fileName = `${cliName}-${version}-${os}-${arch}${musl ? '-musl' : ''}${baseline ? '-baseline' : ''}`;

		const outFile = fileURLToPath(new URL(`../bundles/${fileName}`, import.meta.url));

		console.log(`Building ${cliName} for ${target} (result: ${fileName})...`);
		// TODO: --sourcemap crashes for w/e reason and --bytecode doesn't support ESM (TLA to be exact)
		await $`bun build --compile --minify --target=${target} --outfile=${outFile} ${entryPoint}`;

		// Remove the arch override
		await writeFile(metadataFile, newContent);
	}
}

await writeFile(metadataFile, originalContent);
