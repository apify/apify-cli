import { once } from 'node:events';
import { fstat as fstat_ } from 'node:fs';
import process from 'node:process';
import { promisify } from 'node:util';

const fstat = promisify(fstat_);

export async function readStdin(stdinStream: typeof process.stdin = process.stdin) {
	// The best showcase of what this does: https://stackoverflow.com/a/59024214
	const pipedIn = await fstat(0)
		.then((stat) => stat.isFIFO())
		.catch(() => false);

	// The isTTY params says if TTY is connected to the process, if so the stdout is
	// synchronous and the stdout steam is empty.
	// See https://nodejs.org/docs/latest-v12.x/api/process.html#process_a_note_on_process_i_o
	if (stdinStream.isTTY || (stdinStream.readableEnded && !pipedIn)) {
		return;
	}

	// This is required for some reason when piping from a previous oclif run
	stdinStream.resume();

	const bufferChunks: Buffer[] = [];

	stdinStream.on('data', (chunk) => {
		bufferChunks.push(chunk);
	});

	await once(stdinStream, 'end');

	const concat = Buffer.concat(bufferChunks);

	if (concat.length) {
		return concat;
	}

	return undefined;
}
