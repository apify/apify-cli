import { once } from 'node:events';

import { useStdin } from '../hooks/useStdin.js';

export async function readStdin() {
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

	stream.on('data', (chunk) => {
		bufferChunks.push(chunk);

		// If we got some data already, we can clear the timeout, as we will get more
		if (timeout) {
			clearTimeout(timeout);
			timeout = null;
		}
	});

	try {
		await once(stream, 'end', { signal: controller.signal });
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
