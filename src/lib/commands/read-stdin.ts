import { once } from 'node:events';

import { warning } from '../outputs.js';

export async function readStdin(stdinStream: typeof process.stdin) {
	// The isTTY params says if TTY is connected to the process, if so the stdout is
	// synchronous and the stdout steam is empty.
	// See https://nodejs.org/docs/latest-v12.x/api/process.html#process_a_note_on_process_i_o
	if (stdinStream.isTTY || stdinStream.readableEnded) {
		return;
	}

	const ac = new AbortController();

	let abortTimeout: NodeJS.Timeout | undefined;
	const warningTimeout = setTimeout(() => {
		warning({
			message:
				'CLI has been waiting for input from standard input for more than a second and will stop waiting in 5 seconds.',
		});

		abortTimeout = setTimeout(() => {
			ac.abort();
		}, 5000);
	}, 1000);

	// This is required for some reason when piping from a previous oclif run
	stdinStream.resume();

	const bufferChunks: Buffer[] = [];
	stdinStream.on('data', (chunk) => {
		bufferChunks.push(chunk);
		warningTimeout.refresh();
		abortTimeout?.refresh();
	});

	try {
		await once(stdinStream, 'end', { signal: ac.signal });

		return Buffer.concat(bufferChunks);
	} catch {
		return;
	} finally {
		clearTimeout(warningTimeout);

		if (abortTimeout) {
			clearTimeout(abortTimeout);
		}
	}
}
