/// <reference types="@types/bun" />

/*
This script is responsible for creating the CLI bundles (one file that embeds runtime with the CLI code, that can be just downloaded and ran).

At the time of writing (~2025-05-31), the bundles are created using Bun as the runtime and the targets you can see in the code.
When node stabilizes SEA (https://nodejs.org/api/single-executable-applications.html) [and supports ESM -.-], this code can be adapted to build it using that instead (but cross-platform will be a CI experience)
*/

import { readFileSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

import { type Build, build, fileURLToPath } from 'bun';

import { version } from '../package.json' with { type: 'json' };

const targets = (() => {
	if (process.env.APIFY_FULL_CLI_BUNDLES) {
		return [
			//
			'bun-windows-x64',
			'bun-windows-x64-baseline',
			'bun-windows-arm64',
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
			'bun-linux-x64-musl-baseline' as never,
			'bun-linux-arm64-musl-baseline' as never,
		] satisfies Build.CompileTarget[];
	}

	if (process.platform === 'win32') {
		if (process.arch === 'arm64') {
			return ['bun-windows-arm64'] satisfies Build.CompileTarget[];
		}

		return ['bun-windows-x64', 'bun-windows-x64-baseline'] satisfies Build.CompileTarget[];
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
		'bun-linux-x64-musl-baseline' as never,
		'bun-linux-arm64-musl-baseline' as never,
	] satisfies Build.CompileTarget[];
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

	const lines = readFileSync(entryPoint, 'utf-8').split('\n');
	lines.splice(1, 0, 'import "proxy-agent";');

	// Step 1: create one fat JS file with node resolver to ensure no imports point to non-node export conditions
	const result = await build({
		entrypoints: [entryPoint],
		files: {
			[entryPoint]: lines.join('\n'),
		},
		outdir: fileURLToPath(new URL(`../bundles/fat-clis`, import.meta.url)),
		conditions: 'node',
		target: 'bun',
		sourcemap: 'none',
	});

	const entrypointResultFilePath = result.outputs[0]!.path;

	// Fix apify client js (it now lazy loads proxy-agent, which makes bun skip it from the bundle)
	{
		const entrypointResultFileContent = await result.outputs[0]!.text();

		const newEntrypointResultFileContent = entrypointResultFileContent.replace(
			`(0, utils_1.dynamicNodeImport)("proxy-agent")`,
			`Promise.resolve().then(() => import_proxy_agent)`,
		);

		await writeFile(entrypointResultFilePath, newEntrypointResultFileContent);
	}

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

		// Step 2: create the final executable bundle
		await build({
			entrypoints: [entrypointResultFilePath],
			compile: {
				outfile: outFile,
				target,
			},
			format: 'esm',
			minify: {
				identifiers: true,
				keepNames: true,
			},
			bytecode: true,
		});
	}
}

await writeFile(metadataFile, originalContent);
