import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import process from 'node:process';

import { readDotEnv } from '../../../src/lib/dotenv.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';

describe('readDotEnv()', () => {
	const { tmpPath, joinPath, beforeAllCalls, afterAllCalls } = useTempPath('dotenv-read-test', {
		create: true,
		remove: true,
		cwd: false,
		cwdParent: false,
	});

	beforeEach(async () => {
		await beforeAllCalls();
	});

	afterEach(async () => {
		await afterAllCalls();
	});

	it('returns null when there is no .env', async () => {
		expect(await readDotEnv(tmpPath)).toBeNull();
	});

	it('returns null when .env is a directory, like a Python virtualenv', async () => {
		mkdirSync(joinPath('.env'));

		expect(await readDotEnv(tmpPath)).toBeNull();
	});

	it('parses comments, quotes, export, multi-line values, and = in values', async () => {
		writeFileSync(
			joinPath('.env'),
			[
				'# a comment',
				'PLAIN=1',
				'DOUBLE="two words"',
				"SINGLE='single'",
				'export EXPORTED=4',
				'EMPTY=',
				'SECRET_REF=@mySecret',
				'MULTI="first',
				'second"',
				'WITH_EQUALS=a=b',
			].join('\n'),
		);

		expect(await readDotEnv(tmpPath)).toStrictEqual({
			PLAIN: '1',
			DOUBLE: 'two words',
			SINGLE: 'single',
			EXPORTED: '4',
			EMPTY: '',
			SECRET_REF: '@mySecret',
			MULTI: 'first\nsecond',
			WITH_EQUALS: 'a=b',
		});
	});

	// Windows and root ignore file permissions.
	it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('fails when .env cannot be read', async () => {
		const path = joinPath('.env');
		writeFileSync(path, 'KEY=value');
		chmodSync(path, 0o000);

		try {
			await expect(readDotEnv(tmpPath)).rejects.toThrow(/^Couldn't read .*\.env/);
		} finally {
			chmodSync(path, 0o600);
			rmSync(path);
		}
	});
});
