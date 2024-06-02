import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

import mime from 'mime';

import { readStdin } from './read-stdin.js';
import { CommandExitCodes } from '../consts.js';
import { error } from '../outputs.js';
import { getLocalInput } from '../utils.js';

export function resolveInput(cwd: string, inputOverride: Record<string, unknown> | undefined) {
	let inputToUse: Record<string, unknown> | undefined;
	let contentType!: string;

	if (inputOverride) {
		inputToUse = inputOverride;
		contentType = 'application/json';
	} else {
		const localInput = getLocalInput(cwd);

		if (localInput) {
			const ext = mime.getExtension(localInput.contentType!);

			if (ext === 'json') {
				inputToUse = JSON.parse(localInput.body.toString('utf8'));
				contentType = 'application/json';
			} else {
				inputToUse = localInput.body as never;
				contentType = localInput.contentType!;
			}
		}
	}

	if (!inputToUse || !contentType) {
		return null;
	}

	return { inputToUse, contentType };
}

export async function getInputOverride(cwd: string, inputFlag: string | undefined, inputFileFlag: string | undefined) {
	let input: Record<string, unknown> | undefined;
	let source: 'stdin' | 'input' | string;

	if (!inputFlag && !inputFileFlag) {
		// Try reading stdin
		const stdin = await readStdin(process.stdin);

		if (stdin) {
			try {
				const parsed = JSON.parse(stdin);

				if (Array.isArray(parsed)) {
					throw new Error('The provided input is invalid. It should be an object, not an array.');
				}

				input = parsed;
				source = 'stdin';
			} catch (err) {
				error({ message: `Cannot parse JSON input from standard input.\n  ${(err as Error).message}` });
				process.exitCode = CommandExitCodes.InvalidInput;
				return false;
			}
		}
	}

	if (inputFlag) {
		switch (inputFlag[0]) {
			case '-': {
				error({
					message:
						'You need to pipe something into standard input when you specify the `-` value to `--input`.',
				});
				process.exitCode = CommandExitCodes.InvalidInput;
				return false;
			}
			default: {
				try {
					const parsed = JSON.parse(inputFlag);

					if (Array.isArray(parsed)) {
						throw new Error('The provided input is invalid. It should be an object, not an array.');
					}

					input = parsed;
					source = 'input';
				} catch (err) {
					error({ message: `Cannot parse JSON input.\n  ${(err as Error).message}` });
					process.exitCode = CommandExitCodes.InvalidInput;
					return false;
				}
			}
		}
	} else if (inputFileFlag) {
		switch (inputFileFlag[0]) {
			case '-': {
				error({
					message:
						'You need to pipe something into standard input when you specify the `-` value to `--input-file`.',
				});
				process.exitCode = CommandExitCodes.InvalidInput;
				return false;
			}
			default: {
				const fullPath = resolve(cwd, inputFileFlag);

				try {
					const fileContent = await readFile(fullPath, 'utf8');
					const parsed = JSON.parse(fileContent);

					if (Array.isArray(parsed)) {
						throw new Error('The provided input is invalid. It should be an object, not an array.');
					}

					input = parsed;
					source = inputFileFlag;
				} catch (err) {
					error({ message: `Cannot read input file at path "${fullPath}".\n  ${(err as Error).message}` });
					process.exitCode = CommandExitCodes.InvalidInput;
					return false;
				}
			}
		}
	}

	return input ? { input, source: source! } : undefined;
}
