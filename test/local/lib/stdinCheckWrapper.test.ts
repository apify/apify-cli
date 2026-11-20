// Force the non-interactive code path in stdinCheckWrapper by faking a CI environment.
// See src/lib/hooks/user-confirmations/_stdinCheckWrapper.ts.
vitest.mock('ci-info', async (importOriginal) => {
	const original = await importOriginal<typeof import('ci-info')>();
	return { ...original, isCI: true };
});

import { stdinCheckWrapper } from '../../../src/lib/hooks/user-confirmations/_stdinCheckWrapper.js';

describe('stdinCheckWrapper (non-interactive / CI mode)', () => {
	it('throws when providedConfirmFromStdin is not given', async () => {
		const wrapped = stdinCheckWrapper(async () => true);
		await expect(wrapped({})).rejects.toThrow();
	});

	it('does not mention --confirm or --no-confirm in the default error (regression for #1354)', async () => {
		const wrapped = stdinCheckWrapper(async () => true);
		await expect(wrapped({})).rejects.toThrow(
			expect.objectContaining({ message: expect.not.stringMatching(/--confirm|--no-confirm/) }),
		);
	});

	it('mentions --yes in the default error message', async () => {
		const wrapped = stdinCheckWrapper(async () => true);
		await expect(wrapped({})).rejects.toThrow(/--yes/);
	});

	it('returns providedConfirmFromStdin without calling the inner function', async () => {
		const inner = vitest.fn(async () => false);
		const wrapped = stdinCheckWrapper(inner);
		const result = await wrapped({ providedConfirmFromStdin: true });
		expect(result).toBe(true);
		expect(inner).not.toHaveBeenCalled();
	});

	it('uses caller-supplied errorMessageForStdin over the default', async () => {
		const wrapped = stdinCheckWrapper(async () => true);
		await expect(wrapped({ errorMessageForStdin: 'Custom non-interactive error' })).rejects.toThrow(
			'Custom non-interactive error',
		);
	});

	it('uses wrapper-level errorMessageForStdin when no per-call override is given', async () => {
		const wrapped = stdinCheckWrapper(async () => true, {
			errorMessageForStdin: 'Wrapper-level message',
		});
		await expect(wrapped({})).rejects.toThrow('Wrapper-level message');
	});

	it('per-call errorMessageForStdin takes precedence over wrapper-level', async () => {
		const wrapped = stdinCheckWrapper(async () => true, {
			errorMessageForStdin: 'Wrapper-level message',
		});
		await expect(wrapped({ errorMessageForStdin: 'Per-call message' })).rejects.toThrow('Per-call message');
	});
});
