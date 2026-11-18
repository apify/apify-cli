import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import process from 'node:process';

import { downloadTemplate } from 'giget';

import { ALLOWED_GIT_PROTOCOLS, parseGitRepoUrl, withAllowedGitProtocols } from '../../../src/lib/git-repo-url.js';

const ACCEPTED: [input: string, expected: ReturnType<typeof parseGitRepoUrl>][] = [
	['https://github.com/apify/actor-templates', { url: 'https://github.com/apify/actor-templates' }],
	['https://github.com/apify/actor-templates.git', { url: 'https://github.com/apify/actor-templates.git' }],
	['https://git.example.com:8443/team/repo.git', { url: 'https://git.example.com:8443/team/repo.git' }],
	['https://user:token@github.com/a/b.git', { url: 'https://user:token@github.com/a/b.git' }],
	['ssh://git@github.com/a/b.git', { url: 'ssh://git@github.com/a/b.git' }],
	['ssh://github.com/a/b.git', { url: 'ssh://github.com/a/b.git' }],
	['git@github.com:a/b.git', { url: 'git@github.com:a/b.git' }],
	['https://github.com/a/b.git#main', { url: 'https://github.com/a/b.git', branch: 'main' }],
	['https://github.com/a/b.git#feature/x-1', { url: 'https://github.com/a/b.git', branch: 'feature/x-1' }],
	[
		'https://github.com/a/b.git#master:actors/my-actor',
		{ url: 'https://github.com/a/b.git', branch: 'master', subdir: 'actors/my-actor' },
	],
	['https://github.com/a/b.git#:sub/dir', { url: 'https://github.com/a/b.git', subdir: 'sub/dir' }],
	['git@github.com:a/b.git#main:sub', { url: 'git@github.com:a/b.git', branch: 'main', subdir: 'sub' }],
	['ssh://git@github.com/a/b.git#v1.0:sub', { url: 'ssh://git@github.com/a/b.git', branch: 'v1.0', subdir: 'sub' }],
];

const REJECTED = [
	'',
	'ext::sh -c touch% /tmp/x',
	'ext::sh',
	'file:///x',
	'fd::3',
	'/abs/path',
	'./rel',
	'../rel',
	'rel/path',
	'-oProxyCommand=x',
	'--upload-pack=x',
	'http://github.com/a/b.git',
	'git://github.com/a/b.git',
	'HTTPS://github.com/a/b.git',
	'https://github.com',
	'https://github.com/a/b.git ',
	'https://github.com/a b',
	'https://-host/a/b',
	'https://github.com/a/-b',
	'https://github.com/a/b/../../c',
	'https://github.com/a/b?x=1',
	'ssh://-oProxyCommand=x/a/b',
	'ssh://git@host/a/b::c',
	'-x@github.com:a/b',
	'git@-oProxyCommand=x:a/b',
	'git@github.com:-a/b',
	'git@github.com::a/b',
	'github.com:a/b',
	'gh:a/b',
	'github:a/b',
	'a/b',
	'https://h/a/b.git#--orphan=x',
	'https://h/a/b.git#-b',
	'https://h/a/b.git#main:-sub',
	'https://h/a/b.git#main:sub/--x',
	'https://h/a/b.git#main:../../etc',
	'https://h/a/b.git#:--stdin',
	'https://h/a/b.git#ma in',
	'https://h/a/b.git#main:su\tb',
	'https://h/a/b.git#main\n--x',
	'https://h/a/b.git#main:sub:more',
	'https://h/a/b.git#main#other',
];

describe('parseGitRepoUrl', () => {
	it.each(ACCEPTED)('accepts %s', (input, expected) => {
		expect(parseGitRepoUrl(input)).toEqual(expected);
	});

	it.each(REJECTED)('rejects %j', (input) => {
		expect(() => parseGitRepoUrl(input)).toThrow(/Can't pull Actor from Git URL/);
	});
});

describe('withAllowedGitProtocols', () => {
	const original = process.env.GIT_ALLOW_PROTOCOL;

	afterEach(() => {
		if (original === undefined) delete process.env.GIT_ALLOW_PROTOCOL;
		else process.env.GIT_ALLOW_PROTOCOL = original;
	});

	it('sets GIT_ALLOW_PROTOCOL during the call and removes it after', async () => {
		delete process.env.GIT_ALLOW_PROTOCOL;

		const seen = await withAllowedGitProtocols(async () => process.env.GIT_ALLOW_PROTOCOL);

		expect(seen).toBe(ALLOWED_GIT_PROTOCOLS);
		expect(process.env.GIT_ALLOW_PROTOCOL).toBeUndefined();
	});

	it('restores the previous value when the call throws', async () => {
		process.env.GIT_ALLOW_PROTOCOL = 'file';

		await expect(
			withAllowedGitProtocols(async () => {
				expect(process.env.GIT_ALLOW_PROTOCOL).toBe(ALLOWED_GIT_PROTOCOLS);
				throw new Error('boom');
			}),
		).rejects.toThrow('boom');

		expect(process.env.GIT_ALLOW_PROTOCOL).toBe('file');
	});
});

// A fake `git` on PATH records the argv that giget builds, so the validator and giget's own parser can't drift apart.
describe.skipIf(process.platform === 'win32')('giget argv for accepted URLs', () => {
	const savedEnv = { PATH: process.env.PATH, XDG_CACHE_HOME: process.env.XDG_CACHE_HOME };
	let workDir: string;
	let logPath: string;

	beforeEach(() => {
		workDir = mkdtempSync(join(tmpdir(), 'git-repo-url-test-'));
		logPath = join(workDir, 'argv.log');

		const binDir = join(workDir, 'bin');
		mkdirSync(binDir);

		// The shallow clone fails when a branch is set, so giget also runs its fallback commands.
		writeFileSync(
			join(binDir, 'git'),
			[
				'#!/bin/sh',
				`printf '%s\\n' "$@" >> "${logPath}"`,
				`printf -- '--END--\\n' >> "${logPath}"`,
				'if [ "$1" = clone ]; then for arg in "$@"; do [ "$arg" = --branch ] && exit 1; done; fi',
				'if [ "$1" = sparse-checkout ]; then mkdir -p -- "$3"; fi',
				'exit 0',
				'',
			].join('\n'),
		);
		chmodSync(join(binDir, 'git'), 0o755);
		process.env.PATH = `${binDir}${delimiter}${savedEnv.PATH}`;
		process.env.XDG_CACHE_HOME = join(workDir, 'cache');
	});

	afterEach(() => {
		for (const [key, value] of Object.entries(savedEnv)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
		rmSync(workDir, { recursive: true, force: true });
	});

	it.each(ACCEPTED)('giget passes safe arguments to git for %s', async (input, expected) => {
		await downloadTemplate(`git:${input}`, { dir: join(workDir, 'out') }).catch(() => undefined);

		expect(existsSync(logPath)).toBe(true);
		const calls = readFileSync(logPath, 'utf8')
			.split('--END--\n')
			.filter(Boolean)
			.map((call) => call.split('\n').filter(Boolean));

		const clone = calls.find((args) => args[0] === 'clone')!;
		const uri = clone[clone.indexOf('--') + 1];

		expect(uri.startsWith('-')).toBe(false);
		expect(expected.url.startsWith(uri)).toBe(true);

		const pathSubdir = expected.url
			.slice(uri.length)
			.replace(/^\.git/, '')
			.replace(/^\//, '');
		const subdir = expected.subdir ?? (pathSubdir || undefined);

		if (expected.branch) {
			expect(clone[clone.indexOf('--branch') + 1]).toBe(expected.branch);
			expect(calls).toContainEqual(['remote', 'add', 'origin', uri]);
			expect(calls).toContainEqual(['checkout', expected.branch]);
		} else {
			expect(clone).not.toContain('--branch');
		}

		const sparse = calls.find((args) => args[0] === 'sparse-checkout');
		expect(sparse).toEqual(subdir ? ['sparse-checkout', 'set', subdir] : undefined);
	});
});
