import process from 'node:process';

import { readEnvVarValue } from '../../../../src/lib/env-vars/value-input.js';

const state = vitest.hoisted(() => ({ isTTY: false, isCI: false }));
const readStdin = vitest.hoisted(() => vitest.fn());
const stdinWasCutShort = vitest.hoisted(() => vitest.fn());
const maskedInput = vitest.hoisted(() => vitest.fn());
const userInput = vitest.hoisted(() => vitest.fn());

vitest.mock('../../../../src/lib/hooks/useStdin.js', () => ({
	useStdin: async () => ({ isTTY: state.isTTY, hasData: !state.isTTY, waitDelay: 0, stream: process.stdin }),
}));
vitest.mock('../../../../src/lib/commands/read-stdin.js', () => ({ readStdin, stdinWasCutShort }));
vitest.mock('../../../../src/lib/hooks/user-confirmations/useMaskedInput.js', () => ({ useMaskedInput: maskedInput }));
vitest.mock('../../../../src/lib/hooks/user-confirmations/useUserInput.js', () => ({ useUserInput: userInput }));
vitest.mock('ci-info', async (importOriginal) => ({
	...(await importOriginal<typeof import('ci-info')>()),
	get isCI() {
		return state.isCI;
	},
}));

let originalExitCode: typeof process.exitCode;

beforeEach(() => {
	originalExitCode = process.exitCode;
	process.exitCode = undefined;
	state.isTTY = false;
	state.isCI = false;
	readStdin.mockReset();
	stdinWasCutShort.mockReset().mockReturnValue(false);
	maskedInput.mockReset().mockResolvedValue('typed-masked');
	userInput.mockReset().mockResolvedValue('typed-plain');
});

afterEach(() => {
	process.exitCode = originalExitCode;
});

describe('readEnvVarValue', () => {
	it('uses the masked prompt in a terminal when masked', async () => {
		state.isTTY = true;

		await expect(readEnvVarValue({ name: 'API_KEY', masked: true })).resolves.toBe('typed-masked');
		expect(maskedInput).toHaveBeenCalledWith({ message: 'Value of API_KEY:' });
		expect(userInput).not.toHaveBeenCalled();
		expect(readStdin).not.toHaveBeenCalled();
	});

	it('uses the plain prompt in a terminal when not masked', async () => {
		state.isTTY = true;

		await expect(readEnvVarValue({ name: 'LOG_LEVEL', masked: false })).resolves.toBe('typed-plain');
		expect(userInput).toHaveBeenCalledWith({ message: 'Value of LOG_LEVEL:' });
		expect(maskedInput).not.toHaveBeenCalled();
	});

	it('reads stdin instead of prompting in CI, even with a terminal', async () => {
		state.isTTY = true;
		state.isCI = true;
		readStdin.mockResolvedValue(Buffer.from('from-stdin'));

		await expect(readEnvVarValue({ name: 'API_KEY', masked: true })).resolves.toBe('from-stdin');
		expect(maskedInput).not.toHaveBeenCalled();
	});

	it('reads stdin implicitly without a terminal', async () => {
		readStdin.mockResolvedValue(Buffer.from('value'));

		await expect(readEnvVarValue({ name: 'API_KEY', masked: true })).resolves.toBe('value');
		expect(readStdin).toHaveBeenCalledWith({ implicit: true });
	});

	it.each([
		['one trailing LF', 'value\n', 'value'],
		['one trailing CRLF', 'value\r\n', 'value'],
		['only the last of two newlines', 'value\n\n', 'value\n'],
		['inner newlines and spaces', ' multi\nline \n', ' multi\nline '],
	])('strips %s', async (_, input, expected) => {
		readStdin.mockResolvedValue(Buffer.from(input));

		await expect(readEnvVarValue({ name: 'API_KEY', masked: false })).resolves.toBe(expected);
	});

	it('fails with the "No value" message when stdin has no data', async () => {
		readStdin.mockResolvedValue(undefined);

		await expect(readEnvVarValue({ name: 'API_KEY', masked: false })).rejects.toThrow(
			`No value for API_KEY. Run the command in a terminal to type it, or pipe it: printf '%s' "$VALUE" | apify env set API_KEY`,
		);
		expect(process.exitCode).toBe(5);
	});

	it('fails with the "No value" message when a silent pipe was cut short', async () => {
		readStdin.mockResolvedValue(undefined);
		stdinWasCutShort.mockReturnValue(true);

		await expect(readEnvVarValue({ name: 'API_KEY', masked: false })).rejects.toThrow('No value for API_KEY.');
	});

	it('fails when stdin paused before it ended', async () => {
		readStdin.mockResolvedValue(Buffer.from('partial'));
		stdinWasCutShort.mockReturnValue(true);

		const promise = readEnvVarValue({ name: 'API_KEY', masked: false });
		await expect(promise).rejects.toThrow('Standard input paused before it ended');
		await expect(promise).rejects.not.toThrow('partial');
		expect(process.exitCode).toBe(5);
	});
});
