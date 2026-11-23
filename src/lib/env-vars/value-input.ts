import { isCI } from 'ci-info';

import { readStdin, stdinWasCutShort } from '../commands/read-stdin.js';
import { useMaskedInput } from '../hooks/user-confirmations/useMaskedInput.js';
import { useUserInput } from '../hooks/user-confirmations/useUserInput.js';
import { useStdin } from '../hooks/useStdin.js';
import { envFail } from './errors.js';

/** The value for `apify env set`: a prompt in a terminal, otherwise stdin. Never from an argument. */
export async function readEnvVarValue({ name, masked }: { name: string; masked: boolean }): Promise<string> {
	const { isTTY } = await useStdin();

	if (isTTY && !isCI) {
		const message = `Value of ${name}:`;
		return masked ? useMaskedInput({ message }) : useUserInput({ message });
	}

	// Implicit, so an inherited pipe that never closes can't hang an agent.
	const data = await readStdin({ implicit: true });

	// Checked first: a silent pipe also counts as cut short.
	if (!data) {
		envFail(
			`No value for ${name}. Run the command in a terminal to type it, or pipe it: printf '%s' "$VALUE" | apify env set ${name}`,
		);
	}

	if (stdinWasCutShort()) {
		envFail(
			'Standard input paused before it ended, so the value may be incomplete. Pipe the whole value and close the pipe.',
		);
	}

	return data.toString('utf8').replace(/\r?\n$/, '');
}
