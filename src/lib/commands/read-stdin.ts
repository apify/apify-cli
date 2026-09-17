import { once } from 'node:events';

import { useStdin } from '../hooks/useStdin.js';

/**
 * How long an implicit read waits for stdin to say something. Long enough for a writer that has to
 * fetch or compute its first bytes, short enough that a pipe with nothing behind it does not look
 * like a hang.
 */
const IMPLICIT_STDIN_IDLE_TIMEOUT_MILLIS = 2_000;

let readPromise: Promise<Buffer | undefined> | undefined;
let readResult: Buffer | undefined;

export interface ReadStdinOptions {
	/**
	 * Stop at the first quiet gap instead of waiting for the writer to close stdin. Set it where
	 * stdin is a fallback the user never asked for, so the command cannot hang on a pipe it merely
	 * inherited (#1206). Leave it off for an explicit `-`, which waits for as long as the writer
	 * wants, the way `cat` does.
	 */
	implicit?: boolean;
}

/**
 * Reads stdin, at most once per process. Call it only when the command actually wants stdin data.
 * The first call decides the options; later ones reuse its result.
 */
export async function readStdin(options: ReadStdinOptions = {}) {
	readPromise ??= _readStdin(options).then((data) => {
		readResult = data;
		return data;
	});

	return readPromise;
}

/**
 * Stdin data from a completed read, without starting one. Undefined until a read finishes. For
 * diagnostics only.
 */
export function peekStdin() {
	return readResult;
}

async function _readStdin({ implicit }: ReadStdinOptions) {
	const { hasData, waitDelay, stream } = await useStdin();

	if (!hasData) {
		return;
	}

	// `waitDelay` guards the first byte on a socket, and nothing else. An implicit read needs more
	// than that: an inherited pipe may send nothing at all, and may stay open after it does, so
	// waiting for the end of the stream never finishes (#1206).
	const idleTimeout = implicit ? IMPLICIT_STDIN_IDLE_TIMEOUT_MILLIS : waitDelay;

	const bufferChunks: Buffer[] = [];

	const controller = new AbortController();

	let timeout: NodeJS.Timeout | null = null;

	const armTimeout = () => {
		if (idleTimeout) {
			timeout = setTimeout(() => controller.abort(), idleTimeout).unref();
		}
	};

	const disarmTimeout = () => {
		if (timeout) {
			clearTimeout(timeout);
			timeout = null;
		}
	};

	armTimeout();

	const onData = (chunk: Buffer) => {
		bufferChunks.push(chunk);

		disarmTimeout();

		// An implicit read has no other way to tell that the writer is done, so every chunk restarts
		// the clock. An explicit one waits for the real end of the stream, and its deadline only ever
		// guarded the first byte.
		if (implicit) {
			armTimeout();
		}
	};

	stream.on('data', onData);

	try {
		await once(stream, 'end', { signal: controller.signal });
	} catch (error) {
		const casted = error as Error;

		// An explicit read that runs out its deadline saw nothing at all, so it has nothing to give
		// back. An implicit one keeps whatever arrived before stdin went quiet.
		if (casted.name === 'AbortError' && !implicit) {
			return;
		}
	} finally {
		// Stop reading from stdin so its open handle can't keep the event loop (and
		// the CLI) alive after the command finishes (#1206).
		stream.off('data', onData);
		stream.pause();
	}

	disarmTimeout();

	const concat = Buffer.concat(bufferChunks);

	if (concat.length) {
		return concat;
	}

	return undefined;
}
