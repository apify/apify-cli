import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { checkActorPaths, formatActorPathProblems } from '../../../src/lib/actor-paths.js';
import { getActorLocalFilePaths } from '../../../src/lib/utils.js';

const ACTOR_PATH = 'actors/x';

describe('checkActorPaths', () => {
	let root: string;
	let actorDir: string;
	let uploadedFiles: string[];

	const write = (relativePath: string, content = 'content') => {
		mkdirSync(dirname(join(root, relativePath)), { recursive: true });
		writeFileSync(join(root, relativePath), content);
	};

	// The Actor folder is what an ordinary push uploads.
	const check = (
		config: Record<string, unknown>,
		options: { uploadRoot?: string; uploadedFiles?: string[]; dockerContextRoot?: string } = {},
	) => checkActorPaths({ actorDir, uploadRoot: actorDir, uploadedFiles, config, ...options });

	beforeAll(async () => {
		root = mkdtempSync(join(tmpdir(), 'apify-cli-actor-paths-'));
		actorDir = join(root, ACTOR_PATH);
		write(`${ACTOR_PATH}/.actor/actor.json`, '{}');
		write(`${ACTOR_PATH}/.actor/INPUT_SCHEMA.json`, '{}');
		write(`${ACTOR_PATH}/.actor/README.md`);
		write(`${ACTOR_PATH}/.actorignore`, 'Dockerfile.ci\n');
		write(`${ACTOR_PATH}/Dockerfile`, 'FROM apify/actor-node:20\n');
		write(`${ACTOR_PATH}/Dockerfile.ci`, 'FROM apify/actor-node:20\n');
		write(`${ACTOR_PATH}/src/index.js`);
		write('shared/Dockerfile', 'FROM apify/actor-node:20\n');
		write('shared/input_schema.json', '{}');
		symlinkSync(join(root, 'shared', 'input_schema.json'), join(actorDir, '.actor', 'linked_schema.json'));
		uploadedFiles = await getActorLocalFilePaths(actorDir);
	});

	afterAll(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('passes files inside the upload root, next to actor.json or above it', () => {
		expect(check({ input: './INPUT_SCHEMA.json', readme: './README.md', dockerfile: '../Dockerfile' })).toEqual([]);
		expect(check({ input: 'INPUT_SCHEMA.json' })).toEqual([]);
	});

	it('does nothing for a config without path fields', () => {
		expect(check({ name: 'x', version: '0.0', environmentVariables: { A: '1' } })).toEqual([]);
		expect(check({})).toEqual([]);
	});

	it('skips inline schema objects', () => {
		expect(
			check({
				input: { title: 'Input', type: 'object', properties: {} },
				storages: { dataset: { fields: {} }, datasets: { main: { fields: {} } } },
			}),
		).toEqual([]);
	});

	it('rejects a path above the upload root', () => {
		expect(check({ dockerfile: '../../../shared/Dockerfile' })).toEqual([
			{
				field: 'dockerfile',
				value: '../../../shared/Dockerfile',
				resolvedPath: join(root, 'shared', 'Dockerfile'),
				reason: `lies outside the uploaded folder ${actorDir}`,
			},
		]);
	});

	it('rejects an absolute path', () => {
		const value = resolve('/x');

		expect(check({ input: value })).toEqual([
			{ field: 'input', value, resolvedPath: value, reason: 'is absolute; the path is relative to .actor/' },
		]);
	});

	it('rejects a missing file', () => {
		expect(check({ input: './missing.json' })).toEqual([
			{
				field: 'input',
				value: './missing.json',
				resolvedPath: join(actorDir, '.actor', 'missing.json'),
				reason: 'does not exist',
			},
		]);
	});

	it('rejects a directory', () => {
		expect(check({ dockerfile: '../src' })).toEqual([
			{
				field: 'dockerfile',
				value: '../src',
				resolvedPath: join(actorDir, 'src'),
				reason: 'is a directory, not a file',
			},
		]);
	});

	it('rejects a file push does not upload', () => {
		expect(check({ dockerfile: '../Dockerfile.ci' })).toEqual([
			{
				field: 'dockerfile',
				value: '../Dockerfile.ci',
				resolvedPath: join(actorDir, 'Dockerfile.ci'),
				reason: 'is not among the files apify push uploads (excluded by .gitignore or .actorignore?)',
			},
		]);
	});

	it('judges a symlink by its own path, as push uploads its content there', () => {
		// The link points outside the upload root; push reads through it and uploads the content at the link's path.
		expect(uploadedFiles).toContain('.actor/linked_schema.json');
		expect(check({ input: './linked_schema.json' })).toEqual([]);

		const withoutLink = uploadedFiles.filter((file) => file !== '.actor/linked_schema.json');
		expect(check({ input: './linked_schema.json' }, { uploadedFiles: withoutLink })).toEqual([
			{
				field: 'input',
				value: './linked_schema.json',
				resolvedPath: join(actorDir, '.actor', 'linked_schema.json'),
				reason: 'is not among the files apify push uploads (excluded by .gitignore or .actorignore?)',
			},
		]);
	});

	it('matches the name of dockerfile, readme and changelog case-insensitively, and a schema exactly', () => {
		expect(check({ dockerfile: '../dockerfile', readme: './readme.MD' })).toEqual([]);
		expect(check({ input: './input_schema.json' })).toEqual([
			{
				field: 'input',
				value: './input_schema.json',
				resolvedPath: join(actorDir, '.actor', 'input_schema.json'),
				reason: 'does not exist (the name must match INPUT_SCHEMA.json exactly)',
			},
		]);
	});

	it('checks every string-valued schema reference', () => {
		expect(
			check({
				output: './output.json',
				webServerSchema: './openapi.json',
				storages: { keyValueStore: './kvs.json', dataset: './dataset.json', datasets: { main: './main.json' } },
			}).map((problem) => problem.field),
		).toEqual(['output', 'webServerSchema', 'storages.keyValueStore', 'storages.dataset', 'storages.datasets.main']);
	});

	it('checks inputSchema and outputSchema, which win over input and output', () => {
		expect(check({ inputSchema: './in.json', outputSchema: './out.json' }).map((problem) => problem.field)).toEqual([
			'inputSchema',
			'outputSchema',
		]);
		// The worker copies a set alias over its base key, so the base key is never resolved.
		expect(check({ input: './missing.json', inputSchema: './INPUT_SCHEMA.json' })).toEqual([]);
		expect(check({ output: './missing.json', outputSchema: { type: 'object' } })).toEqual([]);
		expect(check({ input: './missing.json', inputSchema: '' }).map((problem) => problem.field)).toEqual(['input']);
	});

	it('requires dockerfile inside the Docker context when one is given', () => {
		const monorepoFiles = [`${ACTOR_PATH}/Dockerfile`, `${ACTOR_PATH}/.actor/actor.json`, 'shared/Dockerfile'];
		const monorepo = { uploadRoot: root, uploadedFiles: monorepoFiles, dockerContextRoot: join(root, 'shared') };

		expect(check({ dockerfile: '../../../shared/Dockerfile' }, monorepo)).toEqual([]);
		expect(check({ dockerfile: '../Dockerfile' }, monorepo)).toEqual([
			{
				field: 'dockerfile',
				value: '../Dockerfile',
				resolvedPath: join(actorDir, 'Dockerfile'),
				reason: `lies outside the Docker context ${join(root, 'shared')}`,
			},
		]);
		expect(check({ dockerfile: '../Dockerfile' }, { ...monorepo, dockerContextRoot: root })).toEqual([]);
	});
});

describe('formatActorPathProblems', () => {
	it('lists every problem with its field, value, resolved path and reason', () => {
		const message = formatActorPathProblems([
			{
				field: 'dockerfile',
				value: '../Dockerfile.prod',
				resolvedPath: '/actor/Dockerfile.prod',
				reason: 'does not exist',
			},
			{ field: 'input', value: '/schema.json', resolvedPath: '/schema.json', reason: 'is absolute' },
		]);

		expect(message).toBe(
			[
				'.actor/actor.json refers to files the Apify platform could not use:',
				'  "dockerfile": "../Dockerfile.prod" (/actor/Dockerfile.prod) does not exist.',
				'  "input": "/schema.json" (/schema.json) is absolute.',
				'Paths are relative to .actor/ and must point to files inside the uploaded folder.',
			].join('\n'),
		);
	});
});
