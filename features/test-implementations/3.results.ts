import { deepStrictEqual, strictEqual } from 'node:assert';

import { Then } from '@cucumber/cucumber';

import { assertWorldHasRanCommand, assertWorldIsValid, type TestWorld } from './0.world';

Then<TestWorld>(/the local run has input json/i, async function (jsonBlock: string) {
	assertWorldIsValid(this);
	assertWorldHasRanCommand(this);

	if (typeof jsonBlock !== 'string') {
		throw new TypeError(
			'When using the `the local run has input json` step, you must provide a text block containing the expected json object',
		);
	}

	const parsed = JSON.parse(jsonBlock);

	if (typeof parsed !== 'object' || !parsed) {
		throw new TypeError('When using the `the local run has input json` step, you must provide a JSON object');
	}

	if (Array.isArray(parsed)) {
		throw new TypeError(
			'When using the `the local run has input json` step, you must provide a JSON object, not an array',
		);
	}

	deepStrictEqual(this.testResults.runResults.receivedInput, parsed);
});

Then<TestWorld>(/the local actor run has started/i, async function () {
	assertWorldIsValid(this);
	assertWorldHasRanCommand(this);

	// Impossible at this point, but we'll check anyway
	strictEqual(this.testResults.runResults.started, 'works', 'Actor did not start correctly');
});

Then<TestWorld>(/the exit status code is `?(\d+)`?/i, function (expectedExitCode: number) {
	assertWorldIsValid(this);
	assertWorldHasRanCommand(this);

	if (typeof expectedExitCode !== 'number') {
		throw new TypeError('When using the `the exit status code is` step, you must provide a number');
	}

	strictEqual(this.testResults.exitCode, expectedExitCode);
});
