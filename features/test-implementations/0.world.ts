import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import type { IWorld } from '@cucumber/cucumber';
import { Result } from '@sapphire/result';
import { type Options, type ExecaError, type Result as ExecaResult, execaNode } from 'execa';

type DynamicOptions = {
	-readonly [P in keyof Options]: Options[P];
};

/**
 * An interface representing the `this` context in cucumber. This will store things, from what command to run, to the output of the command, its standard output/error, and any other information that needs to be shared between steps.
 */
export interface TestWorld<Parameters = unknown[]> extends IWorld<Parameters> {
	testResults?: {
		exitCode: number;
		stdout: string;
		stderr: string;
		runResults: Awaited<ReturnType<typeof getActorRunResults>> | null;
	};
	testActor?: {
		/**
		 * The path to use as the working directory for the test/command execution. Usually, it'll be in ./test/tmp/<random id>
		 */
		pwd?: URL;
		/**
		 * Whether the actor is ready to execute `When` steps. This is only used to ensure order in certain `Given` requirements
		 */
		initialized?: boolean;
		/**
		 * Input that should be provided to the command via stdin
		 */
		stdinInput?: string;
	};
}

/**
 * The root path of the CLI project, used as the cwd for process execution
 */
export const ProjectRoot = new URL('../../', import.meta.url);

export const DevRunFile = new URL('./bin/dev.js', ProjectRoot);

export const TestTmpRoot = new URL('./test/tmp/', ProjectRoot);

const require = createRequire(import.meta.url);

const tsxCli = require.resolve('tsx/cli');

if (!tsxCli) {
	throw new RangeError('tsx/cli not found! Make sure you have all dependencies installed');
}

export async function executeCommand({
	rawCommand,
	stdin,
	cwd = TestTmpRoot,
}: { rawCommand: string; stdin?: string; cwd?: string | URL }) {
	// Step 0: ensure the command is executable -> strip out $, trim spaces
	const commandToRun = rawCommand.split('\n').map((str) => str.replace(/^\$/, '').trim());

	if (commandToRun.length > 1) {
		// Step 0.1: ensure the command string is not multi-line
		throw new RangeError(`Command cannot be multi-line, received:\n${commandToRun}`);
	}

	// step 1: get the first element, and make sure it starts with `apify`
	const [command] = commandToRun;

	if (!command.startsWith('apify')) {
		// TODO: maybe try to parse these commands out and provide stdin that way, but for now, its better to get the writer to use the existing rules
		if (command.startsWith('echo') || command.startsWith('jo')) {
			throw new RangeError(
				`When writing a test case, please use the "given the following input provided via standard input" rule for providing standard input to the command you're testing.\nReceived: ${command}`,
			);
		}

		throw new RangeError(`Command must start with 'apify', received: ${command}`);
	}

	const cleanCommand = command.replace(/^apify/, '').trim();

	const options: DynamicOptions = {
		cwd,
	};

	if (process.env.CUCUMBER_PRINT_EXEC) {
		options.verbose = 'full';
	}

	if (stdin) {
		options.input = stdin;
	}

	function stripQuotes(str: string) {
		return str.replace(/^['"]/, '').replace(/['"]$/, '');
	}

	// Who knows if this will be stable!
	const commandArguments = cleanCommand.split(' ').flatMap((val) => {
		const split = val.split('=');

		// --input, --run
		if (split.length === 1) {
			return stripQuotes(val);
		}

		// --xxx=yyy[=zzz...]
		const [key, ...value] = split;

		// technically this shouldn't happen, but sanity insanity
		if (value.length === 0) {
			return stripQuotes(key);
		}

		// Join it back together, as we split it apart, hopefully keeping it 1:1 with what the user wrote
		return [stripQuotes(key), stripQuotes(value.join('='))].join('=');
	});

	// Step 2: execute the command
	return Result.fromAsync<
		ExecaResult<{ cwd: typeof cwd; input: typeof stdin }>,
		ExecaError<{ cwd: typeof cwd; input: typeof stdin }>
	>(async () => {
		const process = execaNode(
			tsxCli,
			[fileURLToPath(DevRunFile), ...commandArguments],
			options as { cwd: typeof cwd; input: typeof stdin },
		);

		// This is needed as otherwise the process just hangs and never resolves when running certain cli commands that may try to read from stdin
		if (!stdin) {
			process.stdin?.end();
		}

		return await process;
	});
}

export function assertWorldIsValid(
	world: TestWorld,
): asserts world is TestWorld & { testActor: { pwd: URL; initialized: true } } {
	if (!world.testActor || !world.testActor.initialized) {
		throw new RangeError(
			'Test actor must be initialized before running any subsequent background requirements. You may have the order of your steps wrong. The "Given my `pwd` is a fully initialized Actor project directory" step needs to run before this step',
		);
	}
}

export function assertWorldHasRanCommand(
	world: TestWorld,
): asserts world is TestWorld & { testResults: { exitCode: number; stdout: string; stderr: string } } {
	if (!world.testResults) {
		throw new RangeError('A command must be ran before this assertion can be checked');
	}
}

export function assertWorldHasRunResult(world: TestWorld): asserts world is TestWorld & {
	testResults: {
		exitCode: number;
		stdout: string;
		stderr: string;
		runResults: Awaited<ReturnType<typeof getActorRunResults>>;
	};
} {
	if (!world.testResults || !world.testResults.runResults) {
		throw new RangeError('A command must be ran successfully before this assertion can be checked');
	}
}

export async function getActorRunResults(world: TestWorld & { testActor: { pwd: URL; initialized: true } }) {
	const startedPath = new URL('./storage/key_value_stores/default/STARTED.json', world.testActor.pwd);
	const inputPath = new URL('./storage/key_value_stores/default/RECEIVED_INPUT.json', world.testActor.pwd);

	const result = await readFile(startedPath, 'utf8').catch(() => null);
	const receivedInput = await readFile(inputPath, 'utf8').catch(() => null);

	if (!result) {
		throw new Error('Actor did not start correctly');
	}

	const parsed = JSON.parse(result);

	if (parsed !== 'works') {
		throw new Error('Actor did not start correctly, expected "works" to be set in STARTED.json');
	}

	return {
		started: parsed,
		receivedInput: receivedInput ? JSON.parse(receivedInput) : null,
	};
}
