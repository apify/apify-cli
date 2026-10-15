import type { ApifyClient } from 'apify-client';

import { KeyValueStoresSetValueCommand } from '../../../../src/commands/key-value-stores/set-value.js';
import { testRunCommand } from '../../../../src/lib/command-framework/apify-command.js';
import { useAuthSetup } from '../../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../../__setup__/hooks/useConsoleSpy.js';

const { mockGetLoggedClientOrThrow, stdin } = vitest.hoisted(() => ({
	mockGetLoggedClientOrThrow: vitest.fn(),
	// What the CLI read from stdin at startup (`cachedStdinInput`); the raw `process.stdin` stream is drained by then.
	stdin: { value: undefined as Buffer | undefined },
}));

vitest.mock('../../../../src/entrypoints/_shared.js', () => ({
	get cachedStdinInput() {
		return stdin.value;
	},
}));

vitest.mock('../../../../src/lib/utils.js', async (importOriginal) => {
	const original = await importOriginal<typeof import('../../../../src/lib/utils.js')>();
	return {
		...original,
		getLoggedClientOrThrow: mockGetLoggedClientOrThrow,
	};
});

useAuthSetup();

const { logMessages } = useConsoleSpy();

const setRecord = vitest.fn();

const fakeClient = () =>
	({
		keyValueStore: (id: string) => ({
			get: async () => ({ id }),
			setRecord,
		}),
	}) as unknown as ApifyClient;

beforeEach(() => {
	mockGetLoggedClientOrThrow.mockResolvedValue(fakeClient());
	setRecord.mockResolvedValue(undefined);
});

afterEach(() => {
	mockGetLoggedClientOrThrow.mockReset();
	setRecord.mockReset();
	stdin.value = undefined;
	process.exitCode = undefined;
});

describe('apify key-value-stores set-value', () => {
	it('stores the data piped on stdin byte for byte when no value argument is given', async () => {
		// Not valid UTF-8, so any text round trip would corrupt it.
		stdin.value = Buffer.from([0x00, 0xff, 0xfe, 0x80, 0x7b, 0x22, 0x61, 0x22, 0x3a, 0x31, 0x7d, 0x0a]);

		await testRunCommand(KeyValueStoresSetValueCommand, {
			args_storeId: 'store1',
			args_itemKey: 'stdin-test',
			flags_contentType: 'application/octet-stream',
		});

		expect(setRecord).toHaveBeenCalledTimes(1);
		expect(setRecord).toHaveBeenCalledWith({
			key: 'stdin-test',
			value: stdin.value,
			contentType: 'application/octet-stream',
		});
		expect(process.exitCode).toBeFalsy();
	});

	it('prefers the value argument over stdin', async () => {
		stdin.value = Buffer.from('from stdin');

		await testRunCommand(KeyValueStoresSetValueCommand, {
			args_storeId: 'store1',
			args_itemKey: 'key',
			args_value: '{"a":1}',
			flags_contentType: 'application/json',
		});

		expect(setRecord).toHaveBeenCalledWith({ key: 'key', value: '{"a":1}', contentType: 'application/json' });
	});

	it('fails without calling the API when there is neither a value argument nor stdin data', async () => {
		await testRunCommand(KeyValueStoresSetValueCommand, {
			args_storeId: 'store1',
			args_itemKey: 'key',
			flags_contentType: 'application/json',
		});

		expect(setRecord).not.toHaveBeenCalled();
		expect(process.exitCode).toBe(1);
		expect(logMessages.error.join('\n')).toContain('No value was provided');
	});
});
