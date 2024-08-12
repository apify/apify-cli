import { When } from '@cucumber/cucumber';

import { assertWorldIsValid, executeCommand, getActorRunResults, type TestWorld } from './0.world';

When<TestWorld>(/i run/i, async function (commandBlock: string) {
	assertWorldIsValid(this);

	if (typeof commandBlock !== 'string') {
		throw new TypeError('When using the `I run` step, you must provide a text block containing a command');
	}

	const result = await executeCommand({
		rawCommand: commandBlock,
		cwd: this.testActor.pwd,
		stdin: this.testActor.stdinInput,
	});

	const runResults = await getActorRunResults(this);

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
