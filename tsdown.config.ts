// eslint-disable-next-line import/no-extraneous-dependencies
import { defineConfig } from 'tsdown';

export default [
	defineConfig({
		entry: ['src/entrypoints/apify.ts', 'src/entrypoints/actor.ts'],
		platform: 'node',
		format: ['esm'],
		target: 'es2022',
		deps: {
			skipNodeModulesBundle: true,
		},
		clean: true,
		minify: {
			compress: {
				keepNames: { function: true, class: true },
			},
			mangle: {
				keepNames: true,
			},
		},
		dts: false,
		sourcemap: true,
		treeshake: false,
		outDir: 'dist',
		outExtensions: () => ({ js: '.js' }),
	}),
	defineConfig({
		entry: ['src/index.ts'],
		platform: 'node',
		format: ['esm'],
		target: 'es2022',
		sourcemap: false,
		dts: false,
		outDir: 'dist',
		outExtensions: () => ({ js: '.js' }),
	}),
];
