import { stdinCheckWrapper } from '../../../../src/lib/hooks/user-confirmations/_stdinCheckWrapper.js';

const useStdinMock = vitest.hoisted(() => vitest.fn());

vitest.mock('../../../../src/lib/hooks/useStdin.js', () => ({ useStdin: useStdinMock }));

// The wrapper consults `isCI` before stdin, so an interactive terminal has to be mocked on both axes.
vitest.mock('ci-info', async (importOriginal) => {
	const original = await importOriginal<typeof import('ci-info')>();
	return { ...original, isCI: false };
});

/** What the wrapper sees when the user is sitting at a terminal. */
const interactiveStdin = () => useStdinMock.mockResolvedValue({ isTTY: true, hasData: false });

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

		// `providedConfirmFromStdin` is a fallback for a stdin nobody can type into, not an answer.
		await expect(wrapped({ providedConfirmFromStdin: true })).resolves.toBe(false);
		expect(prompt).toHaveBeenCalledOnce();
	});
});
