import { once } from 'node:events';

import { useStdin } from '../hooks/useStdin.js';

/** A first byte can wait on a cold API or a big file, so give it room before giving up. */
const IMPLICIT_STDIN_FIRST_BYTE_TIMEOUT_MILLIS = 5_000;

/** Once bytes are flowing, a pipe delivers the rest in milliseconds, so a gap this long ends it. */
const IMPLICIT_STDIN_IDLE_TIMEOUT_MILLIS = 1_000;

let readPromise: Promise<Buffer | undefined> | undefined;
let readResult: Buffer | undefined;
let readFinished = false;
let readCutShort = false;

interface ReadStdinOptions {
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
		readFinished = true;
		return data;
	});

	return readPromise;
}

/**
 * Whether an implicit read gave up before the writer closed stdin. Explains both a payload that
 * ends where nothing should end and a read that came back with nothing.
 */
export function stdinWasCutShort() {
	return readCutShort;
}

/**
 * What a finished read found, for the bug report footer. Says `Not read` while no command has asked
 * for stdin, which is most of them.
 */
export function describeStdinRead() {
	if (!readFinished) {
		return 'Not read';
	}

	return readResult ? 'Yes' : 'No';
}

async function _readStdin({ implicit }: ReadStdinOptions) {
	const { hasData, waitDelay, stream } = await useStdin();

	if (!hasData) {
		return;
	}

	// An inherited pipe may send nothing and stay open, so waiting for the end never finishes
	// (#1206). Keep a shorter platform deadline where there is one: it speeds up every spawned CLI.
	const firstByteTimeout = implicit ? waitDelay || IMPLICIT_STDIN_FIRST_BYTE_TIMEOUT_MILLIS : waitDelay;

	const bufferChunks: Buffer[] = [];

	const controller = new AbortController();

	let timeout: NodeJS.Timeout | null = null;

	const armTimeout = (delay: number) => {
		if (delay) {
			timeout = setTimeout(() => controller.abort(), delay).unref();
		}
	};

	const disarmTimeout = () => {
		if (timeout) {
			clearTimeout(timeout);
			timeout = null;
		}
	};

	armTimeout(firstByteTimeout);

	const onData = (chunk: Buffer) => {
		bufferChunks.push(chunk);

		disarmTimeout();

		// An implicit read has no other way to tell the writer is done, so every chunk restarts the
		// clock. An explicit one waits for the real end of the stream.
		if (implicit) {
			armTimeout(IMPLICIT_STDIN_IDLE_TIMEOUT_MILLIS);
		}
	};

	stream.on('data', onData);

	try {
		await once(stream, 'end', { signal: controller.signal });
	} catch (error) {
		const casted = error as Error;

		if (casted.name === 'AbortError') {
			// An explicit read that runs out its deadline saw nothing at all, so it has nothing to give
			// back. An implicit one keeps whatever arrived before stdin went quiet.
			if (!implicit) {
				return;
			}

			// A socket's short first-byte guard fires for every spawned CLI, so only a read that
			// outwaited the full first-byte budget counts as given up on.
			readCutShort = bufferChunks.length > 0 || firstByteTimeout === IMPLICIT_STDIN_FIRST_BYTE_TIMEOUT_MILLIS;
		}
	} finally {
		// Stop reading so an open stdin handle can't keep the CLI alive after the command (#1206).
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
