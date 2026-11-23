import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

import { getDotEnvPath, readDotEnv } from '../../../../src/lib/env-vars/dotenv.js';

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
		expect(readDotEnv(actorDir)).toEqual({ path: join(actorDir, '.env'), exists: false, content: '', vars: {} });
	});

	it('treats a .env directory, such as a Python virtual environment, as no .env', () => {
		mkdirSync(join(actorDir, '.env', 'bin'), { recursive: true });

		expect(readDotEnv(actorDir)).toEqual({ path: join(actorDir, '.env'), exists: false, content: '', vars: {} });
		expect(process.exitCode).toBeUndefined();
	});

	it('returns the path, the content, and the parsed vars', () => {
		const content = 'A=one\nB=two\n';

		expect(read(content)).toEqual({
			path: getDotEnvPath(actorDir),
			exists: true,
			content,
			vars: { A: 'one', B: 'two' },
		});
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

			expect(() => readDotEnv(actorDir)).toThrow(`Couldn't read ${join(actorDir, '.env')}:`);
			expect(process.exitCode).toBe(5);
		},
	);
});
