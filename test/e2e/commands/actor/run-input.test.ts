import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { runCli } from '../../__helpers__/run-cli.js';
import {
	cleanRunResults,
	createTestActor,
	getRunResults,
	removeTestActor,
	type TestActor,
} from '../../__helpers__/test-actor.js';

describe('[e2e] actor run input', () => {
	let actor: TestActor;

	beforeAll(async () => {
		actor = await createTestActor();

		// Verify the actor runs cleanly before testing input
		const check = await runCli('apify', ['run'], { cwd: actor.dir });
		if (check.exitCode !== 0) {
			throw new Error(`Test actor failed to run:\n${check.stderr}`);
		}

		await cleanRunResults(actor.dir);
	});

	afterAll(async () => {
		if (actor) await removeTestActor(actor);
	});

	afterEach(async () => {
		await cleanRunResults(actor.dir);
	});

	describe('--input flag (inline JSON)', () => {
		it('passes JSON string to the actor', async () => {
			const result = await runCli('apify', ['run', '--input={"foo":"bar"}'], { cwd: actor.dir });

			expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
			const run = await getRunResults(actor.dir);
			expect(run.started).toBe(true);
			expect(run.input).toEqual({ foo: 'bar' });
		});

		it('suggests --input-file when given a file path', async () => {
			const result = await runCli('apify', ['run', '--input=./my-path/file.json'], { cwd: actor.dir });

			expect(result.exitCode).not.toBe(0);
			expect(result.stderr).toContain('Use the "--input-file=" flag instead');
			const run = await getRunResults(actor.dir);
			expect(run.started).toBe(false);
		});

		it('accepts -i as short alias', async () => {
			await runCli('apify', ['run', '-i={"foo":"bar"}'], { cwd: actor.dir });

			const run = await getRunResults(actor.dir);
			expect(run.started).toBe(true);
			expect(run.input).toEqual({ foo: 'bar' });
		});
	});

	describe('--input-file flag (file input)', () => {
		it('reads JSON from an existing file', async () => {
			await writeFile(path.join(actor.dir, 'my-file.json'), '{"foo":"bar"}');

			const result = await runCli('apify', ['run', '--input-file=my-file.json'], { cwd: actor.dir });

			expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
			const run = await getRunResults(actor.dir);
			expect(run.started).toBe(true);
			expect(run.input).toEqual({ foo: 'bar' });
		});

		it('errors when the input file does not exist', async () => {
			const result = await runCli('apify', ['run', '--input-file=the-file-that-doesnt-exist.json'], {
				cwd: actor.dir,
			});

			expect(result.exitCode).not.toBe(0);
			expect(result.stderr).toContain('Cannot read input file at');
			const run = await getRunResults(actor.dir);
			expect(run.started).toBe(false);
		});
	});

	describe('stdin input', () => {
		it('accepts stdin via --input-file=-', async () => {
			const result = await runCli('apify', ['run', '--input-file=-'], {
				cwd: actor.dir,
				stdin: '{"foo":"bar"}',
			});

			expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
			const run = await getRunResults(actor.dir);
			expect(run.started).toBe(true);
			expect(run.input).toEqual({ foo: 'bar' });
		});

		it('accepts stdin implicitly (no flag)', async () => {
			const result = await runCli('apify', ['run'], {
				cwd: actor.dir,
				stdin: '{"foo":"bar"}',
			});

			expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
			const run = await getRunResults(actor.dir);
			expect(run.started).toBe(true);
			expect(run.input).toEqual({ foo: 'bar' });
		});
	});
});
