import { cliDebugPrint } from '../utils/cliDebugPrint.js';

// NOTE: we intentionally use the bare `process` global here instead of
// `import process from 'node:process'`. Vitest's SSR transformer wraps the
// imported default in an object that does not expose EventEmitter methods
// (`.on`, `.off`), so signal registration would silently fail under tests.
// The bare global resolves to the real Node process in both production and
// Vitest's environment.

export interface UseSignalHandlerInput {
	/**
	 * Signals to listen for. Typical values are `['SIGINT', 'SIGTERM', 'SIGHUP']`.
	 */
	signals: NodeJS.Signals[];
	/**
	 * Invoked each time one of the registered signals fires, until the
	 * returned `Disposable` is disposed. When `once` is `true` (the default),
	 * the handler fires at most once and the listener is removed immediately
	 * before it runs, so a follow-up signal falls through to whatever is
	 * installed next (typically Node's default, which terminates the process).
	 *
	 * The returned promise, if any, is not awaited — the caller is responsible
	 * for holding the process open long enough for the handler's work to
	 * complete (e.g. via the guarded async body).
	 */
	handler: (signal: NodeJS.Signals) => void | Promise<void>;
	/**
	 * Before the handler runs, erase the current terminal line and reset all
	 * ANSI styles. This wipes the `^C` that the terminal driver echoes on
	 * SIGINT, and recovers color state when upstream output (e.g. a streamed
	 * job log) was interrupted mid-escape-sequence. Only runs when stderr is
	 * a TTY, so it is safe to leave on when output is piped or redirected.
	 *
	 * Defaults to `true`.
	 */
	cleanTerminalLine?: boolean;
	/**
	 * If `true` (default), the handler runs at most once: after it fires, the
	 * listener is removed so a second signal falls through to Node's default
	 * behavior, which terminates the process. This is the right choice when
	 * there is nothing else to escalate and the user's second Ctrl+C is an
	 * explicit "just quit already".
	 *
	 * Set to `false` to keep the listener active after the handler fires so
	 * the handler can escalate across repeated signals — for example, issuing
	 * a graceful abort on the first Ctrl+C and an immediate abort on the
	 * second — without the process being killed while the work is still in
	 * flight. The caller is responsible for tracking invocation state (e.g.
	 * a counter in the handler's closure) and for eventually disposing of the
	 * hook so signals stop being intercepted.
	 */
	once?: boolean;
}

/**
 * Registers a signal handler for the given signals and returns a `Disposable`
 * that removes it. Pair with the `using` keyword so the listener is always
 * cleaned up when the enclosing block exits — whether the guarded code
 * finishes normally, throws, or returns early.
 *
 * Useful for commands that start work on the Apify platform and want to clean
 * up (e.g. abort a build or a run) when the user interrupts the CLI with
 * Ctrl+C. See {@link UseSignalHandlerInput.once} for the single-shot vs.
 * escalating modes.
 *
 * @example
 * ```ts
 * {
 *   using _signalHandler = useSignalHandler({
 *     signals: ['SIGINT', 'SIGTERM', 'SIGHUP'],
 *     handler: () => client.build(buildId).abort().catch(() => {}),
 *   });
 *
 *   await outputJobLog({ job: build, apifyClient: client });
 * } // listener is removed here
 * ```
 */
// `\r`    - move the cursor to the start of the line (over any `^C` the
//           terminal driver just echoed).
// `\x1b[2K` - erase the entire current line.
// `\x1b[0m` - reset all ANSI styles, in case a streamed log was interrupted
//             mid-escape-sequence and left the terminal colored.
const TERMINAL_LINE_RESET = '\r\x1b[2K\x1b[0m';

export function useSignalHandler({
	signals,
	handler,
	cleanTerminalLine = true,
	once = true,
}: UseSignalHandlerInput): Disposable {
	let disposed = false;

	const wrapped = (signal: NodeJS.Signals) => {
		if (disposed) {
			return;
		}

		// In `once` mode, remove listeners before invoking the handler so a
		// second signal received while the handler is still running uses
		// default behavior (i.e. terminates the process), giving users an
		// escape hatch. In persistent mode, the listener stays so the handler
		// can react to every signal until the hook is explicitly disposed.
		if (once) {
			disposed = true;

			for (const s of signals) {
				process.off(s, wrapped);
			}
		}

		// Synchronously wipe the terminal line before the handler prints
		// anything, so its output is not mixed with the echoed `^C` or
		// stranded ANSI styles. stderr is unbuffered on TTYs, which matters
		// here because we want the reset to hit the terminal immediately.
		if (cleanTerminalLine && process.stderr.isTTY) {
			process.stderr.write(TERMINAL_LINE_RESET);
		}

		cliDebugPrint('useSignalHandler', { event: 'fired', signal, once });

		// Intentionally fire-and-forget: the caller decides whether to block
		// on the handler's work via their own control flow.
		void (async () => {
			try {
				await handler(signal);
			} catch (err) {
				cliDebugPrint('useSignalHandler', { event: 'handler-threw', signal, err });
			}
		})();
	};

	for (const signal of signals) {
		process.on(signal, wrapped);
	}

	cliDebugPrint('useSignalHandler', { event: 'registered', signals, once });

	return {
		[Symbol.dispose]() {
			if (disposed) {
				return;
			}

			disposed = true;

			for (const signal of signals) {
				process.off(signal, wrapped);
			}

			cliDebugPrint('useSignalHandler', { event: 'disposed', signals });
		},
	};
}
