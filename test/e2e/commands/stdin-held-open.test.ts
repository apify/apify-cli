import { mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { execa } from 'execa';

import { TestTmpRoot } from '../__helpers__/tmp.js';

const DistApify = fileURLToPath(new URL('../../../dist/apify.js', import.meta.url));

// How long the CLI gets to exit on its own. The command itself finishes in well
// under a second; the broken behavior never exits at all, so any finite deadline
// separates the two. Generous to absorb slow CI runners.
const EXIT_DEADLINE_MS = 15_000;

describe('[e2e] stdin held open (#1206)', () => {
	const emptyDir = path.join(TestTmpRoot, 'stdin-held-open');

	beforeAll(async () => {
		await rm(emptyDir, { recursive: true, force: true });
		await mkdir(emptyDir, { recursive: true });
	});

	afterAll(async () => {
		await rm(emptyDir, { recursive: true, force: true });
	});

	it('exits on its own when stdin is a pipe that never closes', async () => {
		// The runCli helper cannot express this scenario: it either ignores stdin or
		// writes input and closes it. execa with stdin: 'pipe' and no `input` keeps
		// the child's stdin open for the child's whole lifetime (verified on execa 9),
		// which is what spawned subprocesses (CI runners, agent shells) see. Before
		// the fix, the startup stdin read left process.stdin flowing with a data
		// listener attached, so the CLI printed all its output but never exited.
		const result = await execa('node', [DistApify, 'run'], {
			cwd: emptyDir,
			reject: false,
			timeout: EXIT_DEADLINE_MS,
			stdin: 'pipe',
			env: {
				APIFY_CLI_DISABLE_TELEMETRY: '1',
				APIFY_CLI_SKIP_UPDATE_CHECK: '1',
				APIFY_DISABLE_KEYRING: '1',
			},
		});

		// `timedOut` is the regression signal: the broken build completes the command
		// (same stderr) but never exits, so execa kills it at the deadline.
		expect(result.timedOut, `stderr: ${result.stderr}`).toBe(false);

		// Sanity: the command really ran and failed naturally (an empty dir is not an
		// actor project). Keep this on `apify run`: --version, --help, and unknown
		// commands all call process.exit(), which exits even with a leaked stdin
		// handle and would mask the regression.
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain('Actor is of an unknown format');
	});

	// A named pipe is the harsher case: unlike the socket a spawned child gets, it has no wait
	// deadline, so the old eager startup read blocked forever and the command never even ran.
	// Opening the FIFO read-write keeps a writer attached, so it never reaches EOF, with no
	// second process to manage. Windows has no mkfifo.
	it.skipIf(process.platform === 'win32')('exits on its own when stdin is a named pipe with no writer', async () => {
		const fifo = path.join(emptyDir, 'stdin.fifo');
		await execa('mkfifo', [fifo]);

		const handle = await open(fifo, 'r+');

		try {
			const result = await execa('node', [DistApify, 'run'], {
				cwd: emptyDir,
				reject: false,
				timeout: EXIT_DEADLINE_MS,
				stdin: handle.fd,
				env: {
					APIFY_CLI_DISABLE_TELEMETRY: '1',
					APIFY_CLI_SKIP_UPDATE_CHECK: '1',
					APIFY_DISABLE_KEYRING: '1',
				},
			});

			expect(result.timedOut, `stderr: ${result.stderr}`).toBe(false);
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain('Actor is of an unknown format');
		} finally {
			await handle.close();
			await rm(fifo, { force: true });
		}
	});

	// The tests above stop at the project check, ~100 lines before `apify run` resolves its input.
	// A real project gets that far, and there `run` reads stdin when `--input` is missing — the last
	// path that still hung on a named pipe.
	const createFifoActor = async (name: string) => {
		const dir = path.join(emptyDir, name);

		await mkdir(path.join(dir, '.actor'), { recursive: true });
		await writeFile(
			path.join(dir, '.actor', 'actor.json'),
			JSON.stringify({ actorSpecification: 1, name, version: '0.0', buildTag: 'latest' }),
		);
		await writeFile(
			path.join(dir, 'package.json'),
			JSON.stringify({ name, version: '0.0.1', type: 'module', scripts: { start: 'node main.js' } }),
		);
		// Records the input the CLI handed over, so the test can read it back from disk. Going through
		// a file rather than stdout keeps this independent of how the package manager forwards output.
		await writeFile(
			path.join(dir, 'main.js'),
			[
				"import { readFile, writeFile } from 'node:fs/promises';",
				"import path from 'node:path';",
				"import process from 'node:process';",
				"const store = path.join(process.env.APIFY_LOCAL_STORAGE_DIR ?? 'storage', 'key_value_stores', 'default');",
				"const key = process.env.ACTOR_INPUT_KEY ?? 'INPUT';",
				"const input = await readFile(path.join(store, `${key}.json`), 'utf8').catch(() => 'null');",
				"await writeFile('SEEN_INPUT.json', input);",
			].join('\n'),
		);

		return dir;
	};

	const runWithFifoStdin = async (cwd: string, write?: string) => {
		const fifo = path.join(cwd, 'stdin.fifo');
		await execa('mkfifo', [fifo]);

		// `r+` keeps a writer attached for the whole test, so the pipe never reaches EOF even after
		// the data below is written.
		const handle = await open(fifo, 'r+');

		try {
			if (write) {
				await handle.write(write);
			}

			return await execa('node', [DistApify, 'run'], {
				cwd,
				reject: false,
				timeout: EXIT_DEADLINE_MS,
				stdin: handle.fd,
				env: {
					APIFY_CLI_DISABLE_TELEMETRY: '1',
					APIFY_CLI_SKIP_UPDATE_CHECK: '1',
					APIFY_CLI_SKIP_RENTAL_SUNSET_NOTICE: '1',
					APIFY_DISABLE_KEYRING: '1',
				},
			});
		} finally {
			await handle.close();
			await rm(fifo, { force: true });
		}
	};

	it.skipIf(process.platform === 'win32')('runs a real project when its named pipe stays silent', async () => {
		const actorDir = await createFifoActor('silent-pipe-actor');

		const result = await runWithFifoStdin(actorDir);

		expect(result.timedOut, `stderr: ${result.stderr}`).toBe(false);
		expect(await readFile(path.join(actorDir, 'SEEN_INPUT.json'), 'utf8')).toBe('null');
	});

	it.skipIf(process.platform === 'win32')('uses what a named pipe sent, then stops waiting for more', async () => {
		const actorDir = await createFifoActor('talking-pipe-actor');

		const result = await runWithFifoStdin(actorDir, '{"fromStdin":true}');

		expect(result.timedOut, `stderr: ${result.stderr}`).toBe(false);
		expect(JSON.parse(await readFile(path.join(actorDir, 'SEEN_INPUT.json'), 'utf8'))).toEqual({ fromStdin: true });
	});
});
