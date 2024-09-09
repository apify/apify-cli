import { When } from '@cucumber/cucumber';

import { replaceMatchersInString } from './0.utils';
import {
	assertWorldHasCapturedData,
	assertWorldHasRanCommand,
	assertWorldIsValid,
	executeCommand,
	getActorRunResults,
	type TestWorld,
} from './0.world';

When<TestWorld>(/i run:?$/i, async function (commandBlock: string) {
	assertWorldIsValid(this);

	if (typeof commandBlock !== 'string') {
		throw new TypeError('When using the `I run` step, you must provide a text block containing a command');
	}

	const extraEnv: Record<string, string> = {};

	if (this.authStatePath) {
		// eslint-disable-next-line no-underscore-dangle
		extraEnv.__APIFY_INTERNAL_TEST_AUTH_PATH__ = this.authStatePath;
	}

	const result = await executeCommand({
		rawCommand: commandBlock,
		cwd: this.testActor.pwd,
		stdin: this.testActor.stdinInput,
		env: extraEnv,
	});

	const runResults = await getActorRunResults(this).catch(() => null);

	if (result.isOk()) {
		const value = result.unwrap();

		if (this.testResults) {
			console.error(`\n  Warning: Overwriting existing test results: ${JSON.stringify(this.testResults)}`);
		}

		this.testResults = {
			exitCode: value.exitCode!,
			stderr: value.stderr,
			stdout: value.stdout,
			runResults,
		};
	} else {
		const error = result.unwrapErr();

		if (this.testResults) {
			console.error(`\n  Warning: Overwriting existing test results: ${JSON.stringify(this.testResults)}`);
		}

		this.testResults = {
			exitCode: error.exitCode!,
			stderr: error.stderr,
			stdout: error.stdout,
			runResults,
		};
	}
});

When<TestWorld>(/i capture the (build) id/i, function (match: string) {
	assertWorldIsValid(this);
	assertWorldHasRanCommand(this);

	this.capturedData ??= {};

	switch (match.toLowerCase()) {
		case 'build': {
			const buildId =
				this.testResults?.stderr.match(/Build Started \(ID: (\w+)\)/)?.[1] ??
				// Try stdout as well, as it might be there
				this.testResults?.stdout.match(/Build Started \(ID: (\w+)\)/)?.[1];

			if (!buildId) {
				throw new Error('Failed to capture build ID');
			}

			this.capturedData.buildId = buildId;

			break;
		}

		default: {
			throw new TypeError(`Unhandled capture match type: ${match}`);
		}
	}
});

When<TestWorld>(/i run with captured data/i, async function (commandBlock: string) {
	assertWorldIsValid(this);
	assertWorldHasCapturedData(this);

	if (typeof commandBlock !== 'string') {
		throw new TypeError(
			'When using the `I run with captured data` step, you must provide a text block containing a command',
		);
	}

	const extraEnv: Record<string, string> = {};

	if (this.authStatePath) {
		// eslint-disable-next-line no-underscore-dangle
		extraEnv.__APIFY_INTERNAL_TEST_AUTH_PATH__ = this.authStatePath;
	}

	const result = await executeCommand({
		rawCommand: replaceMatchersInString(commandBlock, {
			buildId: this.capturedData.buildId,
		}),
		cwd: this.testActor.pwd,
		stdin: this.testActor.stdinInput,
		env: extraEnv,
	});

	const runResults = await getActorRunResults(this).catch(() => null);

	if (result.isOk()) {
		const value = result.unwrap();

		if (this.testResults) {
			console.error(`\n  Warning: Overwriting existing test results: ${JSON.stringify(this.testResults)}`);
		}

		this.testResults = {
			exitCode: value.exitCode!,
			stderr: value.stderr,
			stdout: value.stdout,
			runResults,
		};
	} else {
		const error = result.unwrapErr();

		if (this.testResults) {
			console.error(`\n  Warning: Overwriting existing test results: ${JSON.stringify(this.testResults)}`);
		}

		this.testResults = {
			exitCode: error.exitCode!,
			stderr: error.stderr,
			stdout: error.stdout,
			runResults,
		};
	}
});
