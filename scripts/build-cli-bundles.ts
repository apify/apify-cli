/// <reference types="@types/bun" />

import { basename } from 'node:path';

import { $, fileURLToPath } from 'bun';

import { version } from '../package.json' with { type: 'json' };

const targets = ['bun-linux-x64', 'bun-linux-arm64', 'bun-windows-x64', 'bun-darwin-arm64', 'bun-darwin-x64'];

const entryPoints = [
	//
	fileURLToPath(new URL('../src/entrypoints/apify.ts', import.meta.url)),
];

for (const entryPoint of entryPoints) {
	const cliName = basename(entryPoint, '.ts');

	for (const target of targets) {
		const [, os, arch] = target.split('-');

		const fileName = `${cliName}-${version}-${os}-${arch}`;

		const outFile = fileURLToPath(new URL(`../bundles/${fileName}`, import.meta.url));

		console.log(`Building ${cliName} for ${target} (result: ${fileName})...`);
		await $`bun build --compile --target=${target} --outfile=${outFile} ${entryPoint}`;
	}
}
