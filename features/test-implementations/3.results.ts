import { deepStrictEqual, notStrictEqual, strictEqual } from 'node:assert';

import { Then } from '@cucumber/cucumber';

import { assertWorldHasRanCommand, assertWorldHasRunResult, assertWorldIsValid, type TestWorld } from './0.world';

Then<TestWorld>(/the local run has an input json/i, function (jsonBlock: string) {
	assertWorldIsValid(this);
	assertWorldHasRanCommand(this);
	assertWorldHasRunResult(this);

	if (typeof jsonBlock !== 'string') {
		throw new TypeError(
			'When using the `the local run has an input json` step, you must provide a text block containing the expected json object',
		);
	}

	const parsed = JSON.parse(jsonBlock);

	if (typeof parsed !== 'object' || !parsed) {
		throw new TypeError('When using the `the local run has an input json` step, you must provide a JSON object');
	}

	if (Array.isArray(parsed)) {
		throw new TypeError(
			'When using the `the local run has an input json` step, you must provide a JSON object, not an array',
		);
	}

	deepStrictEqual(this.testResults.runResults.receivedInput, parsed);
});

Then<TestWorld>(/the local actor run has started/i, function () {
	assertWorldIsValid(this);
	assertWorldHasRanCommand(this);
	assertWorldHasRunResult(this);

	// Impossible at this point, but we'll check anyway
	strictEqual(this.testResults.runResults.started, 'works', 'Actor did not start correctly');
});

Then<TestWorld>(/the local actor run hasn't even started/i, function () {
	assertWorldIsValid(this);
	assertWorldHasRanCommand(this);

	strictEqual(this.testResults.runResults, null, 'Actor started when it should not have');
});

Then<TestWorld>(/the exit status code is `?(\d+)`?/i, function (expectedExitCode: number) {
	assertWorldIsValid(this);
	assertWorldHasRanCommand(this);

	if (typeof expectedExitCode !== 'number') {
		throw new TypeError('When using the `the exit status code is` step, you must provide a number');
	}

	strictEqual(this.testResults.exitCode, expectedExitCode);
});

Then<TestWorld>(/the exit status code is not `?(\d+)`?/i, function (expectedExitCode: number) {
	assertWorldIsValid(this);
	assertWorldHasRanCommand(this);

	if (typeof expectedExitCode !== 'number') {
		throw new TypeError('When using the `the exit status code is not` step, you must provide a number');
	}

	notStrictEqual(this.testResults.exitCode, expectedExitCode);
});

Then<TestWorld>(/i don't see any node\.js exception/i, function () {
	assertWorldIsValid(this);
	assertWorldHasRanCommand(this);

	// TODO: what does this actually mean? Not seeing any stack traces? Because in dev those will show, in prod they won't...
});

Then<TestWorld>(/i can read text on stderr/i, function (expectedStdout: string) {
	assertWorldIsValid(this);
	assertWorldHasRanCommand(this);

	if (typeof expectedStdout !== 'string') {
		throw new TypeError(
			'When using the `i can read text on stderr` step, you must provide a string block with the expected text',
		);
	}

	const lowercasedResult = this.testResults.stderr.toLowerCase();
	const lowercasedExpected = expectedStdout.toLowerCase();

	strictEqual(
		lowercasedResult.includes(lowercasedExpected),
		true,
		`Expected to find "${lowercasedExpected}" in "${lowercasedResult}"`,
	);
});
