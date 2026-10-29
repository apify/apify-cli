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

/** What it sees in a pipeline: no terminal to prompt on. */
const nonInteractiveStdin = () => useStdinMock.mockResolvedValue({ isTTY: false, hasData: false });

describe('stdinCheckWrapper', () => {
	it('returns preAnswered without prompting, even on a TTY', async () => {
		interactiveStdin();
		const prompt = vitest.fn();
		const wrapped = stdinCheckWrapper(prompt);

		await expect(wrapped({ preAnswered: true })).resolves.toBe(true);
		expect(prompt).not.toHaveBeenCalled();
	});

	it('prompts on a TTY when nothing was pre-answered', async () => {
		interactiveStdin();
		const prompt = vitest.fn().mockResolvedValue(false);
		const wrapped = stdinCheckWrapper(prompt);

		await expect(wrapped({ providedConfirmFromStdin: true })).resolves.toBe(false);
		expect(prompt).toHaveBeenCalledOnce();
	});

	it('falls back to providedConfirmFromStdin only when there is no terminal', async () => {
		nonInteractiveStdin();
		const prompt = vitest.fn();
		const wrapped = stdinCheckWrapper(prompt);

		await expect(wrapped({ providedConfirmFromStdin: true })).resolves.toBe(true);
		expect(prompt).not.toHaveBeenCalled();
	});

	it('throws the caller message when there is no terminal and no answer', async () => {
		nonInteractiveStdin();
		const wrapped = stdinCheckWrapper(vitest.fn());

		await expect(wrapped({ errorMessageForStdin: 'Re-run with --yes.' })).rejects.toThrow('Re-run with --yes.');
	});
});
