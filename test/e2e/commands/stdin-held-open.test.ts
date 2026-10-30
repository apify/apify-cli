import { mkdir, open, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { execa } from 'execa';

import { CliTestEnv, DistActor, DistApify } from '../__helpers__/run-cli.js';
import { TestTmpRoot } from '../__helpers__/tmp.js';

// The broken behavior never exits, so any finite deadline separates it. Generous for slow CI.
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
		// `stdin: 'pipe'` with no `input` keeps the child's stdin open for its whole lifetime, the
		// way a CI runner or agent shell does. runCli cannot express that.
		const result = await execa('node', [DistApify, 'run'], {
			cwd: emptyDir,
			reject: false,
			timeout: EXIT_DEADLINE_MS,
			stdin: 'pipe',
			env: CliTestEnv,
		});

		// The broken build prints the same stderr but never exits. Keep this on `apify run`:
		// --version and --help call process.exit(), which would mask a leaked stdin handle.
		expect(result.timedOut, `stderr: ${result.stderr}`).toBe(false);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain('Actor is of an unknown format');
	});

	// A named pipe has no wait deadline, unlike the socket a spawned child gets, so the old eager
	// read blocked forever. Opening it `r+` keeps a writer attached. Windows has no mkfifo.
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
				env: CliTestEnv,
			});

			expect(result.timedOut, `stderr: ${result.stderr}`).toBe(false);
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain('Actor is of an unknown format');
		} finally {
			await handle.close();
			await rm(fifo, { force: true });
		}
	});

	// The tests above stop at the project check. A real project reaches `run`'s input resolution,
	// the last path that still hung on a named pipe.
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
		// Records the input to a file, not stdout, so the package manager cannot garble it.
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

		// `r+` keeps a writer attached, so the pipe never reaches EOF even after the write below.
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
				env: CliTestEnv,
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
		expect(result.stderr).toContain('Nothing arrived on standard input');
		expect(await readFile(path.join(actorDir, 'SEEN_INPUT.json'), 'utf8')).toBe('null');
	});

	it.skipIf(process.platform === 'win32')('uses what a named pipe sent, then stops waiting for more', async () => {
		const actorDir = await createFifoActor('talking-pipe-actor');

		const result = await runWithFifoStdin(actorDir, '{"fromStdin":true}');

		expect(result.timedOut, `stderr: ${result.stderr}`).toBe(false);
		expect(JSON.parse(await readFile(path.join(actorDir, 'SEEN_INPUT.json'), 'utf8'))).toEqual({ fromStdin: true });
	});
});

describe('[e2e] piped stdin with a slow producer', () => {
	const slowDir = path.join(TestTmpRoot, 'stdin-slow-producer');

	beforeAll(async () => {
		await rm(slowDir, { recursive: true, force: true });
		await mkdir(slowDir, { recursive: true });
	});

	afterAll(async () => {
		await rm(slowDir, { recursive: true, force: true });
	});

	// A producer that scrapes or queries before it prints outlives any idle timeout.
	it.skipIf(process.platform === 'win32')('waits for a producer that takes seconds to print', async () => {
		const storageDir = path.join(slowDir, 'storage');

		// `push-data` writes straight to the default dataset without creating it first.
		await mkdir(path.join(storageDir, 'datasets', 'default'), { recursive: true });

		const result = await execa(
			'sh',
			['-c', `(sleep 3; printf '%s' '{"slow":true}') | node "$1" push-data`, 'sh', DistActor],
			{
				cwd: slowDir,
				reject: false,
				timeout: EXIT_DEADLINE_MS,
				env: { ...CliTestEnv, APIFY_LOCAL_STORAGE_DIR: storageDir },
			},
		);

		expect(result.stderr).not.toContain('No item was provided');
		expect(result.exitCode).toBe(0);

		const dataset = path.join(storageDir, 'datasets', 'default');
		const items = await Promise.all(
			(await readdir(dataset)).map(async (file) => JSON.parse(await readFile(path.join(dataset, file), 'utf8'))),
		);

		expect(items).toEqual([{ slow: true }]);
	});
});
