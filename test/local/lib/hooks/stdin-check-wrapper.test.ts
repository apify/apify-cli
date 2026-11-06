import { stdinCheckWrapper } from '../../../../src/lib/hooks/user-confirmations/_stdinCheckWrapper.js';

const useStdinMock = vitest.hoisted(() => vitest.fn());

vitest.mock('../../../../src/lib/hooks/useStdin.js', () => ({ useStdin: useStdinMock }));

// The wrapper consults `isCI` before stdin, so an interactive terminal has to be mocked on both axes.
vitest.mock('ci-info', async (importOriginal) => {
	const original = await importOriginal<typeof import('ci-info')>();
	return { ...original, isCI: false };
});

/** What the wrapper sees when the user is sitting at a terminal. */
const interactiveStdin = () => useStdinMock.mockResolvedValue({ isTTY: true });

/** What the wrapper sees under `cmd | apify ...`: input to read, but nobody to answer a prompt. */
const pipedStdin = () => useStdinMock.mockResolvedValue({ isTTY: undefined });

describe('stdinCheckWrapper', () => {
	it('returns preAnswered without prompting, even on a TTY', async () => {
		interactiveStdin();
		const prompt = vitest.fn();
		const wrapped = stdinCheckWrapper(prompt);

		await expect(wrapped({ preAnswered: true })).resolves.toBe(true);
		expect(prompt).not.toHaveBeenCalled();
	});

	it('answers from preAnswered before it even looks at stdin', async () => {
		useStdinMock.mockRejectedValue(new Error('stdin should not be inspected'));
		const prompt = vitest.fn();

		await expect(stdinCheckWrapper(prompt)({ preAnswered: false })).resolves.toBe(false);
		expect(prompt).not.toHaveBeenCalled();
	});

	it('still prompts on a TTY when nothing was pre-answered', async () => {
		interactiveStdin();
		const prompt = vitest.fn().mockResolvedValue(false);
		const wrapped = stdinCheckWrapper(prompt);

		// `defaultWhenNonInteractive` is what to assume when nobody can be asked, not an answer.
		await expect(wrapped({ defaultWhenNonInteractive: true })).resolves.toBe(false);
		expect(prompt).toHaveBeenCalledOnce();
	});

	it('falls back to defaultWhenNonInteractive on piped stdin instead of prompting', async () => {
		pipedStdin();
		const prompt = vitest.fn();
		const wrapped = stdinCheckWrapper(prompt);

		await expect(wrapped({ defaultWhenNonInteractive: true })).resolves.toBe(true);
		expect(prompt).not.toHaveBeenCalled();
	});

	it('throws the stdin hint on piped stdin when there is no default to fall back on', async () => {
		pipedStdin();
		const prompt = vitest.fn();
		const wrapped = stdinCheckWrapper(prompt, { errorMessageForStdin: 'pass --confirm' });

		await expect(wrapped({})).rejects.toThrow('pass --confirm');
		expect(prompt).not.toHaveBeenCalled();
	});
});
