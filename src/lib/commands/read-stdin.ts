import { once } from 'node:events';
import { fstat as fstat_ } from 'node:fs';
import process from 'node:process';
import { promisify } from 'node:util';

const fstat = promisify(fstat_);

export async function readStdin(stdinStream: typeof process.stdin = process.stdin) {
	// The best showcase of what this does: https://stackoverflow.com/a/59024214
	const pipedIn = await fstat(0)
		.then((stat) => {
			if (process.env.STDIN_DEBUG) {
				console.error({
					stat,
					isFIFO: stat.isFIFO(),
					isSocket: stat.isSocket(),
					isCharDevice: stat.isCharacterDevice(),
					isRegularFile: stat.isFile(),
				});
			}

			// isFIFO -> `node a | node b`
			// isFile -> `node a < file`
			// isSocket -> child processes (I think) [but we set a timeout of 50ms to avoid hanging]
			return stat.isFIFO() || stat.isFile() || (stat.isSocket() ? 50 : false);
		})
		.catch(() => false);

	if (process.env.STDIN_DEBUG) {
		console.error({ isTTY: stdinStream.isTTY, pipedIn, readableEnd: stdinStream.readableEnded });
	}

	// The isTTY params will be true if there is no piping into stdin
	// pipedIn is set if someone either runs `node a | node b`, or `node a < file`
	// if that is the case, isTTY will be undefined (???)
	// readableEnded is a catch all for when the stream is closed
	if (stdinStream.isTTY || (!pipedIn && (stdinStream.isTTY === undefined || stdinStream.readableEnded))) {
		return;
	}

	const bufferChunks: Buffer[] = [];

	const controller = new AbortController();

	let timeout: NodeJS.Timeout | null = null;

	if (typeof pipedIn === 'number') {
		timeout = setTimeout(() => {
			controller.abort();
		}, pipedIn).unref();
	}

	stdinStream.on('data', (chunk) => {
		bufferChunks.push(chunk);

		// If we got some data already, we can clear the timeout, as we will get more
		if (timeout) {
			clearTimeout(timeout);
			timeout = null;
		}
	});

	try {
		await once(stdinStream, 'end', { signal: controller.signal });
	} catch (error) {
		const casted = error as Error;

		if (casted.name === 'AbortError') {
			return;
		}
	}

	if (timeout) {
		clearTimeout(timeout);
	}

	const concat = Buffer.concat(bufferChunks);

	if (concat.length) {
		return concat;
	}

	return undefined;
}
