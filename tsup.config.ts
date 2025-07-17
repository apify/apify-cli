// eslint-disable-next-line import/no-extraneous-dependencies
import { defineConfig } from 'tsup';

export default [
	defineConfig({
		entry: ['src/entrypoints/apify.ts', 'src/entrypoints/actor.ts'],
		external: [],
		noExternal: [],
		platform: 'node',
		format: ['esm'],
		target: 'es2022',
		skipNodeModulesBundle: true,
		clean: true,
		minify: true,
		terserOptions: {
			mangle: false,
			keep_classnames: true,
			keep_fnames: true,
		},
		splitting: true,
		keepNames: true,
		dts: false,
		sourcemap: true,
		bundle: true,
		treeshake: false,
		outDir: 'dist',
	}),
	defineConfig({
		entry: ['src/index.ts'],
		platform: 'node',
		format: ['esm'],
		target: 'es2022',
		sourcemap: false,
		dts: false,
		outDir: 'dist',
	}),
];
