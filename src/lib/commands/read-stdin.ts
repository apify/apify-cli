import { once } from 'node:events';

import { useStdin } from '../hooks/useStdin.js';

let readPromise: Promise<Buffer | undefined> | undefined;
let readResult: Buffer | undefined;

/**
 * Reads stdin to its end, at most once per process. Callers must only call this when the command
 * actually wants stdin data — a pipe that stays open never ends, so this waits for as long as the
 * writer keeps it open (#1206).
 */
export async function readStdin() {
	readPromise ??= _readStdin().then((data) => {
		readResult = data;
		return data;
	});

	return readPromise;
}

/**
 * Stdin data read so far, without triggering a read. For diagnostics only.
 */
export function peekStdin() {
	return readResult;
}

async function _readStdin() {
	const { hasData, waitDelay, stream } = await useStdin();

	if (!hasData) {
		return;
	}

	const bufferChunks: Buffer[] = [];

	const controller = new AbortController();

	let timeout: NodeJS.Timeout | null = null;

	if (waitDelay) {
		timeout = setTimeout(() => {
			controller.abort();
		}, waitDelay).unref();
	}

	const onData = (chunk: Buffer) => {
		bufferChunks.push(chunk);

		// If we got some data already, we can clear the timeout, as we will get more
		if (timeout) {
			clearTimeout(timeout);
			timeout = null;
		}
	};

	stream.on('data', onData);

	try {
		await once(stream, 'end', { signal: controller.signal });
	} catch (error) {
		const casted = error as Error;

		if (casted.name === 'AbortError') {
			return;
		}
	} finally {
		// Stop reading from stdin so its open handle can't keep the event loop (and
		// the CLI) alive after the command finishes (#1206).
		stream.off('data', onData);
		stream.pause();
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
