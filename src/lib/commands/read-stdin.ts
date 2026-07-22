import { once } from 'node:events';

import { useStdin } from '../hooks/useStdin.js';

export async function readStdin() {
	const dataRef = await useStdin();

	const { hasData, waitDelay, stream } = dataRef;

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
		// the CLI) alive after the command finishes (#1206). This only helps when the
		// await above settles ('end' or the no-data abort). A writer that sends data
		// but never closes stdin still hangs up there; that needs the lazy stdin
		// reading discussed in #1206.
		stream.off('data', onData);
		stream.pause();
	}

	if (timeout) {
		clearTimeout(timeout);
	}

	// Mark further uses of useStdin / readStdin as having no more data since we've read it all
	dataRef.hasData = false;

	const concat = Buffer.concat(bufferChunks);

	if (concat.length) {
		return concat;
	}

	return undefined;
}
