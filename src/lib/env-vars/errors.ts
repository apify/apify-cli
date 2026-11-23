import process from 'node:process';

import { CommandExitCodes } from '../consts.js';

/** Sets the exit code and throws; the command framework prints "Error: <message>" to stderr and keeps the code. */
export function envFail(message: string, exitCode: number = CommandExitCodes.InvalidInput): never {
	process.exitCode = exitCode;
	throw new Error(message);
}
