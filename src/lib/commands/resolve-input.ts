import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

import mime from 'mime';

import { CommandExitCodes } from '../consts.js';
import { error } from '../outputs.js';
import { getLocalInput } from '../utils.js';
import { readStdin } from './read-stdin.js';

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
				const parsed = JSON.parse(stdin.toString('utf8'));

				if (Array.isArray(parsed)) {
					error({ message: 'The provided input is invalid. It should be an object, not an array.' });
					process.exitCode = CommandExitCodes.InvalidInput;
					return false;
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
				const fileExists = await access(resolve(cwd, inputFlag))
					.then(() => true)
					.catch(() => false);

				const inputLooksLikePath =
					// JSON file
					inputFlag.endsWith('.json') ||
					inputFlag.endsWith('.json5') ||
					// UNIX-style path access
					inputFlag.startsWith('/') ||
					inputFlag.startsWith('./') ||
					inputFlag.startsWith('../') ||
					// Home directory access
					inputFlag.includes('~') ||
					// Windows-style path access
					inputFlag.startsWith('.\\') ||
					inputFlag.startsWith('..\\') ||
					inputFlag.includes('\\');

				if (fileExists || inputLooksLikePath) {
					error({
						message: `Providing a JSON file path in the --input flag is not supported. Use the "--input-file=" flag instead`,
					});
					process.exitCode = CommandExitCodes.InvalidInput;
					return false;
				}

				try {
					const parsed = JSON.parse(inputFlag);

					if (Array.isArray(parsed)) {
						error({ message: 'The provided input is invalid. It should be an object, not an array.' });
						process.exitCode = CommandExitCodes.InvalidInput;
						return false;
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

				// Try reading the file, and if that fails, try reading it as JSON

				let fsError: unknown;

				try {
					const fileContent = await readFile(fullPath, 'utf8');
					const parsed = JSON.parse(fileContent);

					if (Array.isArray(parsed)) {
						error({ message: 'The provided input is invalid. It should be an object, not an array.' });
						process.exitCode = CommandExitCodes.InvalidInput;
						return false;
					}

					input = parsed;
					source = inputFileFlag;
				} catch (err) {
					fsError = err;
				}

				if (fsError) {
					try {
						const parsed = JSON.parse(inputFileFlag);

						if (Array.isArray(parsed)) {
							error({ message: 'The provided input is invalid. It should be an object, not an array.' });
							process.exitCode = CommandExitCodes.InvalidInput;
							return false;
						}

						input = parsed;
						source = inputFileFlag;
					} catch {
						error({
							message: `Cannot read input file at path "${fullPath}".\n  ${(fsError as Error).message}`,
						});
						process.exitCode = CommandExitCodes.InvalidInput;
						return false;
					}
				}
			}
		}
	}

	return input ? { input, source: source! } : undefined;
}
