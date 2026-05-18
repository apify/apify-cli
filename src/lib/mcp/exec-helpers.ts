import type { ExecaError } from 'execa';

function isExecaError(err: unknown): err is ExecaError {
	return typeof err === 'object' && err !== null && 'shortMessage' in err && 'command' in err;
}

/** Build a user-facing description of an execa failure, falling back to signal / shortMessage when exitCode is null. */
export function describeExecaError(err: unknown, cmd: string): string {
	if (!isExecaError(err)) return err instanceof Error ? err.message : String(err);
	if (err.exitCode != null) return `${cmd} exited with code ${err.exitCode}`;
	if (err.signal) return `${cmd} exited due to signal ${err.signal}`;
	return err.shortMessage ?? err.message;
}
