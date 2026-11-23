import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

import {
	describeMalformedLines,
	describeUnwritableDotEnvValue,
	ensureDotEnvGitignored,
	getDotEnvPath,
	parseDotEnv,
	readDotEnv,
	serializeDotEnvValue,
	updateDotEnvContent,
	writeDotEnv,
} from '../../../../src/lib/env-vars/dotenv.js';
import { useIsolatedGit } from '../../../__setup__/hooks/useIsolatedGit.js';

useIsolatedGit('dotenv-test-git-home');

describe('readDotEnv', () => {
	let actorDir: string;

	beforeEach(() => {
		actorDir = mkdtempSync(join(tmpdir(), 'dotenv-test-'));
	});

	afterEach(() => {
		rmSync(actorDir, { recursive: true, force: true });
		process.exitCode = undefined;
	});

	const read = (content: string) => {
		writeFileSync(join(actorDir, '.env'), content);
		return readDotEnv(actorDir);
	};

	it('returns no vars when .env is missing', () => {
		expect(readDotEnv(actorDir)).toEqual({
			path: join(actorDir, '.env'),
			exists: false,
			content: '',
			vars: {},
			malformedLines: [],
		});
	});

	it('treats a .env directory, such as a Python virtual environment, as no .env', () => {
		mkdirSync(join(actorDir, '.env', 'bin'), { recursive: true });

		expect(readDotEnv(actorDir)).toEqual({
			path: join(actorDir, '.env'),
			exists: false,
			content: '',
			vars: {},
			malformedLines: [],
		});
		expect(process.exitCode).toBeUndefined();
	});

	it('returns the path, the content, and the parsed vars', () => {
		const content = 'A=one\nB=two\n';

		expect(read(content)).toEqual({
			path: getDotEnvPath(actorDir),
			exists: true,
			content,
			vars: { A: 'one', B: 'two' },
			malformedLines: [],
		});
	});

	it('leaves malformed lines out of the vars and keeps only their numbers', () => {
		const dotEnv = read(
			[
				'A=one',
				'JUNK',
				'=no-name',
				'1BAD=x',
				'BAD-NAME=y',
				'with space=z',
				"BAD.NAME='first",
				'second',
				"third'",
				'export B=two',
				'',
			].join('\n'),
		);

		expect(dotEnv.vars).toEqual({ A: 'one', B: 'two' });
		expect(dotEnv.malformedLines).toEqual([2, 3, 4, 5, 6, 7]);
	});

	it("counts a value with a NUL character as malformed, since a process can't get it in its environment", () => {
		const dotEnv = read('A=one\nTOKEN=secret\0tail\nMULTI="first\nsecond\0"\nB=two\n');

		expect(dotEnv.vars).toEqual({ A: 'one', B: 'two' });
		expect(dotEnv.malformedLines).toEqual([2, 3]);
	});

	it("counts __proto__ as malformed, since the vars can't hold it", () => {
		const dotEnv = read('__proto__=proto-value\nA=one\n');

		expect(dotEnv.vars).toEqual({ A: 'one' });
		expect(dotEnv.malformedLines).toEqual([1]);
	});

	it('ignores full-line comments and blank lines', () => {
		expect(read('# a comment\n\nA=one\n  # indented comment\nB=two\n').vars).toEqual({ A: 'one', B: 'two' });
	});

	it('reads lines without "=", indented comments, and "=" in a last-line value like Node.js 22.16 and later', () => {
		// Node.js 22.1-22.15 and 23 util.parseEnv gives { A, 'JUNK\nB', '# indented comment\nC', D, a: 'b' }.
		expect(read('A=one\nJUNK\nB=two\n  # indented comment\nC=three\nD=a=b').vars).toEqual({
			A: 'one',
			B: 'two',
			C: 'three',
			D: 'a=b',
		});
	});

	it('reads lines that util.parseEnv gets wrong also on Node.js 22.16 and later', () => {
		// Node.js 22.16+ util.parseEnv gives { '': '', '# indented': 'comment', SPACES: 'NEXT=next', 'export EMPTY': '' }.
		expect(read('# comment\n  # indented=comment\nSPACES=  \nNEXT=next\nexport EMPTY=\n=\n').vars).toEqual({
			SPACES: '',
			NEXT: 'next',
			EMPTY: '',
		});
	});

	it('reads empty values and values with "="', () => {
		expect(read('EMPTY=\nWITH_EQUALS=a=b\nLAST=last\n').vars).toEqual({ EMPTY: '', WITH_EQUALS: 'a=b', LAST: 'last' });
	});

	it('accepts the export prefix', () => {
		expect(read('export A=one\n').vars).toEqual({ A: 'one' });
	});

	it('reads quoted and multi-line values', () => {
		const { vars } = read(
			[
				`SINGLE='has # and spaces'`,
				`DOUBLE="line1\\nline2"`,
				'BACKTICK=`it\'s "quoted"`',
				`MULTI='first`,
				`second'`,
				'',
			].join('\n'),
		);

		expect(vars).toEqual({
			SINGLE: 'has # and spaces',
			DOUBLE: 'line1\nline2',
			BACKTICK: `it's "quoted"`,
			MULTI: 'first\nsecond',
		});
	});

	it('reads thousands of quoted values without keeping a copy of the rest of the file for each', () => {
		const content = Array.from({ length: 5000 }, (_, i) => `KEY_${i}="value number ${i} with some text"`).join('\n');
		const heapBefore = process.memoryUsage().heapUsed;

		const { vars } = read(content);

		expect(process.memoryUsage().heapUsed - heapBefore).toBeLessThan(50 * 1024 * 1024);
		expect(Object.keys(vars)).toHaveLength(5000);
		expect(vars.KEY_4999).toBe('value number 4999 with some text');
	});

	it('reads a long run of spaces inside a line in linear time', () => {
		const spaces = ' '.repeat(100_000);
		const start = performance.now();

		const { vars } = read(`TOKEN=abc${spaces}def\nQUOTED="abc${spaces}def"\n`);

		expect(performance.now() - start).toBeLessThan(1000);
		expect(vars).toEqual({ TOKEN: `abc${spaces}def`, QUOTED: `abc${spaces}def` });
	});

	it('keeps the last value of a duplicate key', () => {
		expect(read('A=one\nA=two\n').vars).toEqual({ A: 'two' });
	});

	it('reads CRLF line endings', () => {
		expect(read('A=one\r\nB=two\r\n').vars).toEqual({ A: 'one', B: 'two' });
	});

	it('ignores a UTF-8 byte order mark', () => {
		expect(read('\uFEFFA=one\nB=two\n')).toMatchObject({ content: 'A=one\nB=two\n', vars: { A: 'one', B: 'two' } });
	});

	it('keeps @secret references literal', () => {
		expect(read('TOKEN=@myToken\n').vars).toEqual({ TOKEN: '@myToken' });
	});

	it('returns a plain object', () => {
		expect(Object.getPrototypeOf(read('A=one\n').vars)).toBe(Object.prototype);
	});

	it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
		'fails with exit code 5 when .env cannot be read',
		() => {
			writeFileSync(join(actorDir, '.env'), 'A=one\n');
			chmodSync(join(actorDir, '.env'), 0o000);

			expect(() => readDotEnv(actorDir)).toThrow(new Error(`Couldn't read ${join(actorDir, '.env')} (EACCES).`));
			expect(process.exitCode).toBe(5);
		},
	);
});

describe('serializeDotEnvValue', () => {
	afterEach(() => {
		process.exitCode = undefined;
	});

	it.each([
		['plain', 'abc-123_/:.@=', 'abc-123_/:.@='],
		['empty', '', ''],
		['spaces', ' a b ', "' a b '"],
		['#', 'a#b', "'a#b'"],
		['double quotes', 'say "hi"', `'say "hi"'`],
		['backticks', 'a`b', "'a`b'"],
		['single quotes', "it's", "`it's`"],
		['single quotes and backticks', "it's `x`", '"it\'s `x`"'],
		['newlines', 'line1\nline2', "'line1\nline2'"],
		['backslashes', 'a\\nb\\', 'a\\nb\\'],
		['a backslash and a space', 'a\\n b', "'a\\n b'"],
	])('round-trips a value with %s', (_, value, expected) => {
		const serialized = serializeDotEnvValue('NAME', value);

		if (expected !== undefined) expect(serialized).toBe(expected);
		expect(parseDotEnv(`NAME=${serialized}`).vars.NAME).toBe(value);
	});

	it('fails for a value with single quotes, backticks, and \\n, which double quotes would change', () => {
		expect(() => serializeDotEnvValue('NAME', "it's `a\\nb`")).toThrow(
			"The value of NAME can't be written to .env: it can't be quoted so that it reads back the same.",
		);
	});

	it.each([
		[
			'a carriage return',
			'line1\r\nline2',
			"it has a carriage return, as in Windows line endings, which .env can't hold",
		],
		['a NUL character', 's3cr3t\0tail', "it has a NUL character, which .env can't hold"],
	])('fails for a value with %s and gives the reason', (_, value, reason) => {
		expect(() => serializeDotEnvValue('NAME', value)).toThrow(`The value of NAME can't be written to .env: ${reason}.`);
		expect(describeUnwritableDotEnvValue(value)).toBe(reason);
	});

	it('describes no reason for a value that .env can hold', () => {
		expect(describeUnwritableDotEnvValue("it's\nmulti-line")).toBeUndefined();
	});

	it('fails for a value that contains every quote character, without printing it', () => {
		expect(() => serializeDotEnvValue('NAME', `'"\`s3cr3t`)).toThrow(
			"The value of NAME can't be written to .env: it contains every quote character.",
		);
		expect(process.exitCode).toBe(5);

		try {
			serializeDotEnvValue('NAME', `'"\`s3cr3t`);
		} catch (err) {
			expect((err as Error).message).not.toContain('s3cr3t');
		}
	});
});

describe('updateDotEnvContent', () => {
	afterEach(() => {
		process.exitCode = undefined;
	});

	it('appends keys to empty content in the given order', () => {
		expect(updateDotEnvContent('', { B: '2', A: 'a b' })).toBe("B=2\nA='a b'\n");
	});

	it('replaces a value in place and keeps comments, blank lines, and other keys', () => {
		const content = '# comment\nA=1\n\nexport B=old # note\nC=3\n';

		expect(updateDotEnvContent(content, { B: 'new' })).toBe('# comment\nA=1\n\nexport B=new\nC=3\n');
	});

	it('replaces the last assignment of a duplicate key only', () => {
		expect(updateDotEnvContent('A=1\nB=2\nA=3\n', { A: 'x' })).toBe('A=1\nB=2\nA=x\n');
	});

	it('replaces a multi-line quoted value', () => {
		const content = "A='line1\nB=not-a-key\nline3'\nC=3\n";

		expect(updateDotEnvContent(content, { A: 'one' })).toBe('A=one\nC=3\n');
		expect(updateDotEnvContent(content, { B: 'b' })).toBe(`${content}B=b\n`);
	});

	it('writes a multi-line value that reads back the same', () => {
		const result = updateDotEnvContent('A=1\n', { A: 'x\ny', B: 'z' });

		expect(result).toBe("A='x\ny'\nB=z\n");
		expect(parseDotEnv(result).vars).toEqual({ A: 'x\ny', B: 'z' });
	});

	it('finds the ends of thousands of multi-line values in linear time', () => {
		const lines = Array.from({ length: 100_000 }, (_, i) => `KEY_${i}='first\nsecond'\n`);
		const start = performance.now();

		const result = updateDotEnvContent(lines.join(''), { KEY_99999: 'x', NEW: 'y' });

		expect(performance.now() - start).toBeLessThan(2000);
		expect(result).toBe(`${lines.slice(0, -1).join('')}KEY_99999=x\nNEW=y\n`);
	});

	it('adds a missing final newline before appending', () => {
		expect(updateDotEnvContent('A=1', { B: '2' })).toBe('A=1\nB=2\n');
	});

	it('keeps CRLF line endings', () => {
		expect(updateDotEnvContent('# c\r\nA=1\r\nB=2\r\n', { A: 'x', C: '3' })).toBe('# c\r\nA=x\r\nB=2\r\nC=3\r\n');
	});

	it('fails when the result would not read back as expected', () => {
		// A name that starts with # makes the written line a comment.
		expect(() => updateDotEnvContent('A=1\n', { '#A': '1' })).toThrow(
			"Couldn't update .env without changing other lines. Edit it by hand.",
		);
		expect(process.exitCode).toBe(5);
	});
});

describe('writeDotEnv', () => {
	let actorDir: string;

	beforeEach(() => {
		actorDir = mkdtempSync(join(tmpdir(), 'dotenv-write-test-'));
	});

	afterEach(() => {
		rmSync(actorDir, { recursive: true, force: true });
		process.exitCode = undefined;
	});

	it.skipIf(process.platform === 'win32')(
		'creates .env readable only by its owner and keeps the mode of an existing one',
		() => {
			writeDotEnv(actorDir, 'A=1\n');

			expect(readFileSync(join(actorDir, '.env'), 'utf8')).toBe('A=1\n');
			expect(statSync(join(actorDir, '.env')).mode & 0o777).toBe(0o600);

			chmodSync(join(actorDir, '.env'), 0o640);
			writeDotEnv(actorDir, 'A=2\n');

			expect(readFileSync(join(actorDir, '.env'), 'utf8')).toBe('A=2\n');
			expect(statSync(join(actorDir, '.env')).mode & 0o777).toBe(0o640);
		},
	);

	it('fails when .env is a directory', () => {
		mkdirSync(join(actorDir, '.env'));

		expect(() => writeDotEnv(actorDir, 'A=1\n')).toThrow(
			`${join(actorDir, '.env')} is a directory, for example a Python virtual environment. Rename it, for example to .venv, to use a .env file.`,
		);
		expect(process.exitCode).toBe(5);
	});
});

describe('ensureDotEnvGitignored', () => {
	let actorDir: string;

	const git = (...args: string[]) =>
		execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], {
			cwd: actorDir,
			stdio: 'ignore',
		});
	const gitignore = () => readFileSync(join(actorDir, '.gitignore'), 'utf8');

	beforeEach(() => {
		actorDir = mkdtempSync(join(tmpdir(), 'dotenv-gitignore-test-'));
		git('init', '--quiet');
	});

	afterEach(() => {
		rmSync(actorDir, { recursive: true, force: true });
	});

	it('adds .env to .gitignore when .env does not exist yet', async () => {
		writeFileSync(join(actorDir, '.gitignore'), 'node_modules\n');

		expect(await ensureDotEnvGitignored(actorDir)).toEqual({ added: true, tracked: false });
		expect(gitignore()).toBe('node_modules\n\n# Added by Apify CLI\n.env\n');
	});

	it('creates .gitignore when it is missing', async () => {
		expect(await ensureDotEnvGitignored(actorDir)).toEqual({ added: true, tracked: false });
		expect(gitignore()).toBe('.env\n');
	});

	it('adds nothing when a pattern already ignores .env', async () => {
		writeFileSync(join(actorDir, '.gitignore'), '.env*\n');
		writeFileSync(join(actorDir, '.env'), 'A=1\n');

		expect(await ensureDotEnvGitignored(actorDir)).toEqual({ added: false, tracked: false });
		expect(gitignore()).toBe('.env*\n');
	});

	it('adds nothing when a .gitignore above the Actor directory ignores .env', async () => {
		writeFileSync(join(actorDir, '.gitignore'), '.env\n');
		mkdirSync(join(actorDir, 'actors', 'scraper'), { recursive: true });

		expect(await ensureDotEnvGitignored(join(actorDir, 'actors', 'scraper'))).toEqual({ added: false, tracked: false });
	});

	it('reports a committed .env as tracked', async () => {
		writeFileSync(join(actorDir, '.env'), 'A=1\n');
		git('add', '.env');
		git('commit', '--quiet', '-m', 'init');

		expect(await ensureDotEnvGitignored(actorDir)).toEqual({ added: true, tracked: true });
	});
});

describe('describeMalformedLines', () => {
	it('names the malformed lines by number', () => {
		expect(describeMalformedLines({ path: '/actor/.env', malformedLines: [3, 7] })).toBe(
			'Skipped 2 malformed lines in /actor/.env (lines 3, 7).',
		);
		expect(describeMalformedLines({ path: '/actor/.env', malformedLines: [2] })).toBe(
			'Skipped 1 malformed line in /actor/.env (line 2).',
		);
	});

	it('returns undefined when no line is malformed', () => {
		expect(describeMalformedLines({ path: '/actor/.env', malformedLines: [] })).toBeUndefined();
	});
});
