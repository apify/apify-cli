import { once } from 'node:events';
import { fstat as fstat_ } from 'node:fs';
import process from 'node:process';
import { promisify } from 'node:util';

const fstat = promisify(fstat_);

export async function readStdin(stdinStream: typeof process.stdin = process.stdin) {
	// The best showcase of what this does: https://stackoverflow.com/a/59024214
	const pipedIn = await fstat(0)
		.then((stat) => {
			// isFIFO -> `node a | node b`
			// isFile -> `node a < file`
			return stat.isFIFO() || stat.isFile();
		})
		.catch(() => false);

	// The isTTY params will be true if there is no piping into stdin
	// pipedIn is set if someone either runs `node a | node b`, or `node a < file`
	// if that is the case, isTTY will be undefined (???)
	// readableEnded is a catch all for when the stream is closed
	if (stdinStream.isTTY || (!pipedIn && (stdinStream.isTTY === undefined || stdinStream.readableEnded))) {
		return;
	}

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
