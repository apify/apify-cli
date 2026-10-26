/* eslint-disable max-classes-per-file */
import { parseArgs } from 'node:util';

import {
	ApifyCommand,
	type BuiltApifyCommand as _BuiltApifyCommand,
} from '../../../../src/lib/command-framework/apify-command.js';
import { CommandErrorCode } from '../../../../src/lib/command-framework/CommandError.js';
import { Flags } from '../../../../src/lib/command-framework/flags.js';

const BuiltApifyCommand = ApifyCommand as typeof _BuiltApifyCommand;

let receivedFlags: Record<string, unknown> = {};

class CommandWithRepeatableFlag extends BuiltApifyCommand {
	static override name = 'repeatable' as const;
	static override description = 'Has a repeatable flag and a plain one.';
	static override flags = {
		'actor-dir': Flags.string({ char: 'd', description: 'repeatable', multiple: true }),
		kind: Flags.string({ description: 'repeatable with choices', multiple: true, choices: ['x', 'y'] }),
		once: Flags.string({ description: 'plain' }),
	};

	async run() {
		receivedFlags = this.flags;
	}
}

async function runWith(args: string[]) {
	const instance = new CommandWithRepeatableFlag(
		'apify',
		CommandWithRepeatableFlag.name,
		CommandWithRepeatableFlag.name,
	);
	// eslint-disable-next-line dot-notation
	instance['skipTelemetry'] = true;
	// eslint-disable-next-line dot-notation
	instance['skipNotices'] = true;
	// eslint-disable-next-line dot-notation
	const parsed = parseArgs({ ...instance['_buildParseArgsOption'](), args });
	// eslint-disable-next-line dot-notation
	await instance['_run'](parsed);
}

describe('Flags.string({ multiple: true })', () => {
	beforeEach(() => {
		receivedFlags = {};
	});

	test('keeps every value of a repeated flag, in order', async () => {
		await runWith(['--actor-dir', 'actors/b', '--actor-dir', 'actors/a', '--actor-dir=actors/c']);

		expect(receivedFlags.actorDir).toEqual(['actors/b', 'actors/a', 'actors/c']);
	});

	test('wraps a single value in an array', async () => {
		await runWith(['--actor-dir', 'actors/a']);

		expect(receivedFlags.actorDir).toEqual(['actors/a']);
	});

	test('leaves the flag undefined when it is not passed', async () => {
		await runWith([]);

		expect(receivedFlags.actorDir).toBeUndefined();
	});

	test('strips the = of the short form from every value', async () => {
		await runWith(['-d=actors/a', '-d=actors/b']);

		expect(receivedFlags.actorDir).toEqual(['actors/a', 'actors/b']);
	});

	test('accepts repeated values that are all among the choices', async () => {
		await runWith(['--kind', 'x', '--kind', 'y']);

		expect(receivedFlags.kind).toEqual(['x', 'y']);
	});

	test('rejects a repeated flag when one value is not among the choices', async () => {
		await expect(runWith(['--kind', 'x', '--kind', 'z'])).rejects.toMatchObject({
			code: CommandErrorCode.APIFY_INVALID_CHOICE,
		});
	});

	test('still rejects a repeated flag that did not opt in', async () => {
		await expect(runWith(['--once', 'a', '--once', 'b'])).rejects.toMatchObject({
			code: CommandErrorCode.APIFY_FLAG_PROVIDED_MULTIPLE_TIMES,
		});
	});
});
