import { CommandExitCodes } from '../consts.js';

/**
 * Thrown when an Apify command requires authentication but the user is not logged in
 * (or the stored credentials are unusable).
 *
 * The top-level CLI handler uses this class to decide between:
 *   - printing a human-friendly "please run apify login" message on stderr, or
 *   - emitting a machine-readable JSON envelope on stdout when the invocation
 *     set `--json` (so scripts that pipe `apify ... --json | jq ...` see a
 *     parseable object instead of prose).
 */
export class AuthError extends Error {
	public readonly type = 'AuthError' as const;

	public readonly exitCode: number;

	public constructor(message: string, exitCode: number = CommandExitCodes.MissingAuth) {
		super(message);
		this.name = 'AuthError';
		this.exitCode = exitCode;
	}
}
