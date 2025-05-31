import { constants, fstat as fstat_ } from 'node:fs';
import process from 'node:process';
import { promisify } from 'node:util';

import { cliDebugPrint } from '../utils/cliDebugPrint.js';

const fstat = promisify(fstat_);

export interface StdinState {
	isTTY: boolean;
	hasData: boolean;
	waitDelay: number;
	stream: typeof process.stdin;
}

let cachedStdinState: StdinState | undefined;

export async function useStdin(): Promise<StdinState> {
	if (cachedStdinState) {
		return cachedStdinState;
	}

	const stdinStream = process.stdin;

	// The best showcase of what this does: https://stackoverflow.com/a/59024214
	const state: StdinState = {
		isTTY: stdinStream.isTTY,
		hasData: false,
		waitDelay: 0,
		stream: stdinStream,
	};

	// TODO: use os.guessFileDescriptorType instead once https://github.com/nodejs/node/pull/58060 lands in our supported node versions

	const pipedIn = await fstat(0)
		.then((stat) => {
			cliDebugPrint('useStdin', {
				stat,
				isRegularFile: stat.isFile(),
				isDirectory: stat.isDirectory(),
				isBlockDevice: stat.isBlockDevice(),
				isCharDevice: stat.isCharacterDevice(),
				isSymbolicLink: stat.isSymbolicLink(),
				isFIFO: stat.isFIFO(),
				isSocket: stat.isSocket(),
			});

			// Right now, Windows always returns false for isFIFO, so we have to check for that manually
			// Windows might also wrongly return the mode for this, who knows!
			// TODO: https://github.com/nodejs/node/issues/57603
			if (process.platform === 'win32') {
				// eslint-disable-next-line no-bitwise
				if ((stat.mode & constants.S_IFIFO) === constants.S_IFIFO) {
					return 100;
				}

				// In node 18, for some reason this returns true for vitest, and thus always hangs.
				if (stat.isFile()) {
					return 50;
				}
			}

			// isFIFO -> `node a | node b`
			// isFile -> `node a < file`
			// isSocket -> child processes (I think) [but we set a timeout of 50ms to avoid hanging]
			return stat.isFIFO() || stat.isFile() || (stat.isSocket() ? 50 : false);
		})
		.catch(() => false);

	cliDebugPrint('useStdin', { isTTY: state.isTTY, pipedIn, readableEnded: stdinStream.readableEnded });

	// The isTTY params will be true if there is no piping into stdin
	// pipedIn is set if someone either runs `node a | node b`, or `node a < file`
	// if that is the case, isTTY will be undefined (???)
	// readableEnded is a catch all for when the stream is closed
	if (!stdinStream.isTTY || (pipedIn !== false && (stdinStream.isTTY !== undefined || !stdinStream.readableEnded))) {
		state.hasData = true;
	}

	if (typeof pipedIn === 'number') {
		state.waitDelay = pipedIn;
	}

	cachedStdinState = state;

	return state;
}
