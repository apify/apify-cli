import process from 'node:process';

const { stdinState } = vitest.hoisted(() => ({ stdinState: { isTTY: true, hasData: false } }));

// Pin `isCI` to false so each test picks its branch purely through the mocked `useStdin` below.
vitest.mock('ci-info', async (importOriginal) => {
	const original = await importOriginal<typeof import('ci-info')>();
	return { ...original, isCI: false };
});

vitest.mock('../../../src/lib/hooks/useStdin.js', () => ({
	useStdin: async () => ({ ...stdinState, waitDelay: 0, stream: process.stdin }),
}));

import { stdinCheckWrapper } from '../../../src/lib/hooks/user-confirmations/_stdinCheckWrapper.js';

function makePrompt(answer: boolean | string = true) {
	const prompt = vitest.fn(async (_input: { message: string }) => answer);
	return { prompt, wrapped: stdinCheckWrapper(prompt) };
}

beforeEach(() => {
	stdinState.isTTY = true;
	stdinState.hasData = false;
});

describe('stdinCheckWrapper', () => {
	describe('on a TTY', () => {
		it('returns preAnswered without prompting', async () => {
			const { prompt, wrapped } = makePrompt();

			await expect(wrapped({ message: 'Delete?', preAnswered: true })).resolves.toBe(true);
			expect(prompt).not.toHaveBeenCalled();
		});

		it('returns a falsy preAnswered without prompting', async () => {
			const { prompt, wrapped } = makePrompt(true);

			await expect(wrapped({ message: 'Delete?', preAnswered: false })).resolves.toBe(false);
			expect(prompt).not.toHaveBeenCalled();
		});

		it('returns a preAnswered string without prompting', async () => {
			const { prompt, wrapped } = makePrompt('nope');

			await expect(wrapped({ message: 'Type the tag:', preAnswered: 'beta' })).resolves.toBe('beta');
			expect(prompt).not.toHaveBeenCalled();
		});

		it('still prompts when only providedConfirmFromStdin is set', async () => {
			const { prompt, wrapped } = makePrompt(true);

			await expect(wrapped({ message: 'Add to shell?', providedConfirmFromStdin: false })).resolves.toBe(true);
			expect(prompt).toHaveBeenCalledOnce();
		});

		it('prompts when preAnswered is undefined', async () => {
			const { prompt, wrapped } = makePrompt(true);

			await expect(wrapped({ message: 'Delete?', preAnswered: undefined })).resolves.toBe(true);
			expect(prompt).toHaveBeenCalledOnce();
		});
	});

	describe('without a usable stdin', () => {
		beforeEach(() => {
			stdinState.isTTY = false;
			stdinState.hasData = false;
		});

		it('returns preAnswered', async () => {
			const { prompt, wrapped } = makePrompt();

			await expect(wrapped({ message: 'Delete?', preAnswered: true })).resolves.toBe(true);
			expect(prompt).not.toHaveBeenCalled();
		});

		it('falls back to providedConfirmFromStdin', async () => {
			const { prompt, wrapped } = makePrompt();

			await expect(wrapped({ message: 'Add to shell?', providedConfirmFromStdin: false })).resolves.toBe(false);
			expect(prompt).not.toHaveBeenCalled();
		});

		// The wrapper is generic and its remaining default-message callers (auth/login, the
		// useActorConfig migrations) have no --yes, so the default must not name any flag.
		it('names no flag in the default error message', async () => {
			const { wrapped } = makePrompt();

			await expect(wrapped({ message: 'Delete?' })).rejects.toThrow(/interactive terminal/);
			await expect(wrapped({ message: 'Delete?' })).rejects.not.toThrow(/--/);
		});

		it('throws when neither answer is available', async () => {
			const { prompt, wrapped } = makePrompt();

			await expect(wrapped({ message: 'Delete?', errorMessageForStdin: 'Pass --yes.' })).rejects.toThrow('Pass --yes.');
			expect(prompt).not.toHaveBeenCalled();
		});
	});
});
