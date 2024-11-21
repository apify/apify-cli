import { once } from 'node:events';

export async function readStdin(stdinStream: typeof process.stdin) {
	// The isTTY params says if TTY is connected to the process, if so the stdout is
	// synchronous and the stdout steam is empty.
	// See https://nodejs.org/docs/latest-v12.x/api/process.html#process_a_note_on_process_i_o
	if (stdinStream.isTTY || stdinStream.readableEnded) {
		return;
	}

	// This is required for some reason when piping from a previous oclif run
	stdinStream.resume();

	const bufferChunks: Buffer[] = [];
	stdinStream.on('data', (chunk) => {
		bufferChunks.push(chunk);
	});

	await once(stdinStream, 'end');

	return Buffer.concat(bufferChunks);
}
