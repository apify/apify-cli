import { mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { type ActorPathProblem, checkActorPaths, formatActorPathProblems } from '../../../src/lib/actor-paths.js';
import { resolveDockerContext } from '../../../src/lib/docker-context.js';
import { getActorLocalFilePaths } from '../../../src/lib/utils.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';

const ACTOR_PATH = 'actors/x';

describe('checkActorPaths', () => {
	const { tmpPath, beforeAllCalls, afterAllCalls } = useTempPath('actor-paths-test-dir', {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	// The checker works from real paths, so the expectations do too.
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
		await beforeAllCalls();
		root = realpathSync(tmpPath);
		actorDir = join(root, ACTOR_PATH);
		write(`${ACTOR_PATH}/.actor/actor.json`, '{}');
		write(`${ACTOR_PATH}/.actor/INPUT_SCHEMA.json`, '{}');
		write(`${ACTOR_PATH}/.actor/README.md`);
		write(`${ACTOR_PATH}/.actor/CHANGELOG.md`);
		write(`${ACTOR_PATH}/.actorignore`, 'Dockerfile.ci\n');
		write(`${ACTOR_PATH}/Dockerfile`, 'FROM apify/actor-node:20\n');
		write(`${ACTOR_PATH}/Dockerfile.ci`, 'FROM apify/actor-node:20\n');
		write(`${ACTOR_PATH}/src/index.js`);
		write('shared/Dockerfile', 'FROM apify/actor-node:20\n');
		write('shared/input_schema.json', '{}');
		symlinkSync(join(root, 'shared', 'input_schema.json'), join(actorDir, '.actor', 'linked_schema.json'));
		symlinkSync(join(root, 'shared', 'Dockerfile'), join(actorDir, 'Dockerfile.shared'));
		uploadedFiles = await getActorLocalFilePaths(actorDir);
		symlinkSync(join(root, 'shared', 'missing.json'), join(actorDir, '.actor', 'dangling.json'));
		symlinkSync(actorDir, join(root, 'linked-actor'));
		symlinkSync(join(root, 'shared'), join(actorDir, 'sym'));
	});

	afterAll(async () => {
		await afterAllCalls();
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
				severity: 'error',
			},
		]);
	});

	it('skips an empty string, which the platform treats as an unset field', () => {
		expect(check({ dockerfile: '', input: '', storages: { dataset: '', datasets: { main: '' } } })).toEqual([]);
	});

	it('rejects a backslash before resolving anything', () => {
		expect(check({ dockerfile: '..\\Dockerfile' })).toEqual([
			{
				field: 'dockerfile',
				value: '..\\Dockerfile',
				resolvedPath: '..\\Dockerfile',
				reason: 'uses a backslash; the platform resolves paths with forward slashes',
				severity: 'error',
			},
		]);
	});

	it('rejects an absolute path', () => {
		const value = '/x';

		expect(check({ input: value })).toEqual([
			{
				field: 'input',
				value,
				resolvedPath: value,
				reason: 'is absolute; the path is relative to .actor/',
				severity: 'error',
			},
		]);
	});

	it('rejects a missing file', () => {
		expect(check({ input: './missing.json' })).toEqual([
			{
				field: 'input',
				value: './missing.json',
				resolvedPath: join(actorDir, '.actor', 'missing.json'),
				reason: 'does not exist',
				severity: 'error',
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
				severity: 'error',
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
				severity: 'error',
			},
		]);
	});

	it('rejects a file whose case differs from the uploaded one', () => {
		// A case-insensitive file system finds README.md, but the Git index lists it as readme.md.
		expect(check({ readme: './README.md' }, { uploadedFiles: ['.actor/readme.md'] })).toEqual([
			{
				field: 'readme',
				value: './README.md',
				resolvedPath: join(actorDir, '.actor', 'README.md'),
				reason: 'does not match the case of the uploaded file .actor/readme.md',
				severity: 'warning',
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
				severity: 'error',
			},
		]);
	});

	it('rejects a dangling symlink as missing', () => {
		expect(check({ input: './dangling.json' }, { uploadedFiles: [...uploadedFiles, '.actor/dangling.json'] })).toEqual([
			{
				field: 'input',
				value: './dangling.json',
				resolvedPath: join(actorDir, '.actor', 'dangling.json'),
				reason: 'does not exist',
				severity: 'error',
			},
		]);
	});

	it('judges a symlinked Dockerfile against the Docker context by its own path', () => {
		// The link's target lies outside the context, but push uploads its content at the link's path inside it.
		expect(uploadedFiles).toContain('Dockerfile.shared');
		expect(check({ dockerfile: '../Dockerfile.shared' }, { dockerContextRoot: actorDir })).toEqual([]);
	});

	it('accepts a Dockerfile in a context within a symlinked Actor folder', () => {
		const linkedActorDir = join(root, 'linked-actor');
		const dockerContext = resolveDockerContext(linkedActorDir, '..');
		expect(dockerContext).toEqual({ kind: 'within', contextRoot: actorDir });

		expect(
			checkActorPaths({
				actorDir: linkedActorDir,
				uploadRoot: linkedActorDir,
				uploadedFiles,
				config: { dockerfile: '../Dockerfile' },
				dockerContextRoot: actorDir,
			}),
		).toEqual([]);
	});

	it('accepts a Dockerfile in a Docker context reached through a symlink inside the Actor folder', async () => {
		// `sym` links to the shared folder outside the Actor; push uploads it as a normal folder `sym` inside.
		const dockerContext = resolveDockerContext(actorDir, '../sym');
		expect(dockerContext).toEqual({ kind: 'within', contextRoot: join(actorDir, 'sym') });

		expect(
			checkActorPaths({
				actorDir,
				uploadRoot: actorDir,
				uploadedFiles: await getActorLocalFilePaths(actorDir),
				config: { dockerContextDir: '../sym', dockerfile: '../sym/Dockerfile' },
				dockerContextRoot: join(actorDir, 'sym'),
			}),
		).toEqual([]);
	});

	it('matches the name of dockerfile, readme and changelog case-insensitively, and a schema exactly', () => {
		expect(check({ dockerfile: '../dockerfile', readme: './readme.MD', changelog: './changelog.md' })).toEqual([]);
		expect(check({ input: './input_schema.json' })).toEqual([
			{
				field: 'input',
				value: './input_schema.json',
				resolvedPath: join(actorDir, '.actor', 'input_schema.json'),
				reason: 'does not exist (the name must match INPUT_SCHEMA.json exactly)',
				severity: 'error',
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

	it('warns about a readme or changelog the platform falls back from', () => {
		const severities = (config: Record<string, unknown>) =>
			check(config, { uploadedFiles: [...uploadedFiles, '.actor/dangling.json'] }).map(
				({ field, reason, severity }) => ({ field, reason, severity }),
			);

		expect(severities({ readme: '../README.md', changelog: '../CHANGELOG.md' })).toEqual([
			{ field: 'readme', reason: 'does not exist', severity: 'warning' },
			{ field: 'changelog', reason: 'does not exist', severity: 'warning' },
		]);
		expect(severities({ readme: './dangling.json' })).toEqual([
			{ field: 'readme', reason: 'does not exist', severity: 'warning' },
		]);
		expect(severities({ changelog: '../Dockerfile.ci' })).toEqual([
			{
				field: 'changelog',
				reason: 'is not among the files apify push uploads (excluded by .gitignore or .actorignore?)',
				severity: 'warning',
			},
		]);
		expect(severities({ readme: '.\\README.md' })).toEqual([
			{
				field: 'readme',
				reason: 'uses a backslash; the platform resolves paths with forward slashes',
				severity: 'warning',
			},
		]);
	});

	it('rejects a readme or changelog that fails the build', () => {
		expect(
			check({ readme: '/README.md', changelog: '../../../shared/Dockerfile' }).map(({ field, severity }) => ({
				field,
				severity,
			})),
		).toEqual([
			{ field: 'readme', severity: 'error' },
			{ field: 'changelog', severity: 'error' },
		]);
		expect(check({ readme: '../src' }).map(({ reason, severity }) => ({ reason, severity }))).toEqual([
			{ reason: 'is a directory, not a file', severity: 'error' },
		]);
	});

	it('reads a backslash as the platform does, so an absolute or escaping readme still fails the build', () => {
		expect(
			check({ readme: '/docs\\README.md', changelog: '../../../docs\\CHANGELOG.md' }).map(
				({ field, reason, severity }) => ({ field, reason, severity }),
			),
		).toEqual([
			{ field: 'readme', reason: 'is absolute; the path is relative to .actor/', severity: 'error' },
			{ field: 'changelog', reason: `lies outside the uploaded folder ${actorDir}`, severity: 'error' },
		]);
	});

	it('rejects a missing dockerfile or schema, which the platform does not recover from', () => {
		expect(
			check({ dockerfile: '../Dockerfile.prod', input: './missing.json' }).map(({ field, severity }) => ({
				field,
				severity,
			})),
		).toEqual([
			{ field: 'dockerfile', severity: 'error' },
			{ field: 'input', severity: 'error' },
		]);
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
				severity: 'error',
			},
		]);
		expect(check({ dockerfile: '../Dockerfile' }, { ...monorepo, dockerContextRoot: root })).toEqual([]);
	});
});

describe('checkActorPaths without dockerfile', () => {
	const { tmpPath, beforeAllCalls, afterAllCalls } = useTempPath('actor-paths-default-dockerfile-test-dir', {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	let root: string;

	beforeAll(async () => {
		await beforeAllCalls();
		root = realpathSync(tmpPath);
	});

	afterAll(async () => {
		await afterAllCalls();
	});

	// A fresh Actor folder with the given files, checked as push checks it: the folder is the upload root.
	const checkActor = async (
		name: string,
		files: string[],
		dockerContextDir: string | undefined,
		config: Record<string, unknown> = {},
	) => {
		const actorDir = join(root, name);
		for (const file of ['.actor/actor.json', ...files]) {
			mkdirSync(dirname(join(actorDir, file)), { recursive: true });
			writeFileSync(join(actorDir, file), 'FROM apify/actor-node:20\n');
		}
		const dockerContext = resolveDockerContext(actorDir, dockerContextDir);
		const problems = checkActorPaths({
			actorDir,
			uploadRoot: actorDir,
			uploadedFiles: await getActorLocalFilePaths(actorDir),
			config: { dockerContextDir, ...config },
			dockerContextRoot: dockerContext.kind === 'within' ? dockerContext.contextRoot : undefined,
		});
		return { actorDir, problems };
	};

	it('rejects a default Dockerfile outside the Docker context', async () => {
		const { actorDir, problems } = await checkActor('outside', ['Dockerfile', 'docker/Dockerfile'], '../docker');

		expect(problems).toEqual([
			{
				field: 'dockerfile',
				value: '',
				resolvedPath: join(actorDir, 'Dockerfile'),
				reason: `is not set, so the platform would use the default ${join(actorDir, 'Dockerfile')}, which lies outside the Docker context ${join(actorDir, 'docker')}`,
				severity: 'error',
			},
		]);
	});

	it('rejects the built-in Dockerfile in a Docker context other than the Actor folder', async () => {
		const { actorDir, problems } = await checkActor('built-in', ['docker/Dockerfile'], '../docker');

		expect(problems).toEqual([
			{
				field: 'dockerfile',
				value: '',
				resolvedPath: join(actorDir, 'docker', 'Dockerfile'),
				reason: expect.stringContaining(
					`so the platform would build the Docker context ${join(actorDir, 'docker')} with its built-in Node.js Dockerfile`,
				),
				severity: 'error',
			},
		]);
	});

	it('accepts the built-in Dockerfile when the Docker context is the Actor folder', async () => {
		expect((await checkActor('actor-context', ['src/main.js'], '..')).problems).toEqual([]);
	});

	it('does nothing without a Docker context', async () => {
		expect((await checkActor('no-context', ['src/main.js'], undefined)).problems).toEqual([]);
		expect((await checkActor('no-context-outside', ['Dockerfile', 'docker/Dockerfile'], undefined)).problems).toEqual(
			[],
		);
	});

	it('accepts a default .actor/Dockerfile inside the Docker context, found by any case and before Dockerfile', async () => {
		expect((await checkActor('in-actor-folder', ['.actor/dockerfile', 'Dockerfile'], '.')).problems).toEqual([]);
	});

	it('skips a default Dockerfile push does not upload, as the platform never sees it', async () => {
		// `.actor/` is always uploaded, so only the Dockerfile in the Actor folder can be left out.
		for (const name of ['ignored-actor-context', 'ignored-docker-context']) {
			mkdirSync(join(root, name), { recursive: true });
			writeFileSync(join(root, name, '.actorignore'), 'Dockerfile\n');
		}

		expect((await checkActor('ignored-actor-context', ['Dockerfile'], '..')).problems).toEqual([]);
		const { actorDir, problems } = await checkActor(
			'ignored-docker-context',
			['Dockerfile', 'docker/main.js'],
			'../docker',
		);
		expect(problems).toEqual([
			{
				field: 'dockerfile',
				value: '',
				resolvedPath: join(actorDir, 'docker', 'Dockerfile'),
				reason: expect.stringContaining('is not set and push uploads no .actor/Dockerfile or Dockerfile'),
				severity: 'error',
			},
		]);
	});

	it('leaves a set dockerfile to the usual rules', async () => {
		const { problems } = await checkActor('set', ['Dockerfile', 'docker/Dockerfile'], '../docker', {
			dockerfile: '../docker/Dockerfile',
		});

		expect(problems).toEqual([]);
	});
});

describe('formatActorPathProblems', () => {
	const problems: ActorPathProblem[] = [
		{
			field: 'dockerfile',
			value: '../Dockerfile.prod',
			resolvedPath: '/actor/Dockerfile.prod',
			reason: 'does not exist',
			severity: 'error',
		},
		{
			field: 'readme',
			value: './README.md',
			resolvedPath: '/actor/.actor/README.md',
			reason: 'does not exist',
			severity: 'warning',
		},
		{ field: 'input', value: '/schema.json', resolvedPath: '/schema.json', reason: 'is absolute', severity: 'error' },
		{
			field: 'dockerfile',
			value: '',
			resolvedPath: '/actor/Dockerfile',
			reason: 'is not set, so the platform would use the default /actor/Dockerfile',
			severity: 'error',
		},
	];

	it('lists the errors with their field, value, resolved path and reason', () => {
		expect(formatActorPathProblems(problems, 'error')).toBe(
			[
				'.actor/actor.json refers to files the Apify platform could not use:',
				'  "dockerfile": "../Dockerfile.prod" (/actor/Dockerfile.prod) does not exist.',
				'  "input": "/schema.json" (/schema.json) is absolute.',
				'  "dockerfile" is not set, so the platform would use the default /actor/Dockerfile.',
				'Paths are relative to .actor/ and must point to files inside the uploaded folder.',
			].join('\n'),
		);
	});

	it('lists the warnings under a header that says the push continues', () => {
		expect(formatActorPathProblems(problems, 'warning')).toBe(
			[
				'.actor/actor.json refers to files the Apify platform will not find. The push continues, and the platform falls back to its default README or CHANGELOG:',
				'  "readme": "./README.md" (/actor/.actor/README.md) does not exist.',
				'Paths are relative to .actor/ and must point to files inside the uploaded folder.',
			].join('\n'),
		);
	});

	it('returns an empty string when no problem has the severity', () => {
		expect(formatActorPathProblems(problems.slice(0, 1), 'warning')).toBe('');
	});
});
