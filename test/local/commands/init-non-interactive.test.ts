import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

// `isCI` short-circuits every prompt in `stdinCheckWrapper` into a throw, same as a non-TTY stdin.
vitest.mock('ci-info', async (importOriginal) => {
	const original = await importOriginal<typeof import('ci-info')>();
	return { ...original, isCI: true };
});

import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { LOCAL_CONFIG_PATH } from '../../../src/lib/consts.js';
import { useTempPath } from '../../__setup__/hooks/useTempPath.js';

const { tmpPath, beforeAllCalls, afterAllCalls, forceNewCwd } = useTempPath('init-non-interactive', {
	create: true,
	remove: true,
	cwd: true,
	cwdParent: false,
});

const { InitCommand } = await import('../../../src/commands/init.js');

// Turns a retry loop into a failed assertion in milliseconds instead of a test timeout.
const MAX_ERROR_LINES = 20;

function captureErrorsWithCap() {
	const lines: string[] = [];

	vitest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
		lines.push(args.map(String).join(' '));

		if (lines.length > MAX_ERROR_LINES) {
			throw new Error(`Prompt retry loop: console.error was called more than ${MAX_ERROR_LINES} times.`);
		}
	});

	vitest.spyOn(console, 'log').mockImplementation(() => {});

	return lines;
}

function errorLines(lines: string[]) {
	return lines.filter((line) => line.includes('Error:'));
}

// `resetCwdCaches` resolves the hooks outside the `node:process` mock graph, so it cannot clear the
// caches the command reads. A directory per test keeps the cache keys apart.
async function useFreshCwd(name: string) {
	forceNewCwd(name);
	await mkdir(join(tmpPath, name), { recursive: true });

	return (...paths: string[]) => join(tmpPath, name, ...paths);
}

describe('apify init without a usable stdin', () => {
	beforeEach(async () => {
		await beforeAllCalls();
		process.exitCode = undefined;
	});

	afterEach(async () => {
		process.exitCode = undefined;
		await afterAllCalls();
	});

	it('--yes with no name uses the current directory name', async () => {
		const joinCwd = await useFreshCwd('yes-default-name');
		writeFileSync(joinCwd('package.json'), JSON.stringify({ name: 'pkg', version: '1.0.0' }));

		const lines = captureErrorsWithCap();

		await testRunCommand(InitCommand, { flags_yes: true });

		expect(errorLines(lines)).toStrictEqual([]);
		expect(process.exitCode ?? 0).toBe(0);
		expect(JSON.parse(readFileSync(joinCwd(LOCAL_CONFIG_PATH), 'utf8')).name).toBe('yes-default-name');
	});

	it('--yes sanitizes a directory name that is not a legal Actor name', async () => {
		const joinCwd = await useFreshCwd('yes_sanitized.name');
		writeFileSync(joinCwd('package.json'), JSON.stringify({ name: 'pkg', version: '1.0.0' }));

		const lines = captureErrorsWithCap();

		await testRunCommand(InitCommand, { flags_yes: true });

		expect(errorLines(lines)).toStrictEqual([]);
		expect(process.exitCode ?? 0).toBe(0);
		expect(JSON.parse(readFileSync(joinCwd(LOCAL_CONFIG_PATH), 'utf8')).name).toBe('yes-sanitized-name');
	});

	it('--yes fails when nothing is left of the directory name', async () => {
		const joinCwd = await useFreshCwd('___');
		writeFileSync(joinCwd('package.json'), JSON.stringify({ name: 'pkg', version: '1.0.0' }));

		const lines = captureErrorsWithCap();

		await testRunCommand(InitCommand, { flags_yes: true });

		expect(errorLines(lines)).toHaveLength(1);
		expect(errorLines(lines)[0]).toContain('apify init <name>');
		expect(process.exitCode).toBeDefined();
		expect(process.exitCode).not.toBe(0);
		expect(existsSync(joinCwd(LOCAL_CONFIG_PATH))).toBe(false);
	});

	it('without --yes reports the missing name once and exits non-zero', async () => {
		const joinCwd = await useFreshCwd('no-yes-missing-name');
		writeFileSync(joinCwd('package.json'), JSON.stringify({ name: 'pkg', version: '1.0.0' }));

		const lines = captureErrorsWithCap();

		await testRunCommand(InitCommand, {});

		expect(errorLines(lines)).toHaveLength(1);
		expect(errorLines(lines)[0]).toContain('apify init <name>');
		expect(errorLines(lines)[0]).toContain('--yes');
		expect(process.exitCode).toBeDefined();
		expect(process.exitCode).not.toBe(0);
		expect(existsSync(joinCwd(LOCAL_CONFIG_PATH))).toBe(false);
	});
});
