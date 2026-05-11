import { access, readFile } from 'node:fs/promises';
import path, { resolve } from 'node:path';
import process from 'node:process';

import { resolveInputMessages } from '#i18n/lib/commands/resolve-input.js';
import mime from 'mime';

import { cachedStdinInput } from '../../entrypoints/_shared.js';
import { CommandExitCodes } from '../consts.js';
import { t } from '../i18n/index.js';
import { logger } from '../logger.js';
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
		const stdin = cachedStdinInput;

		if (stdin) {
			try {
				const parsed = JSON.parse(stdin.toString('utf8'));

				if (Array.isArray(parsed)) {
					logger.stderr.error(t(resolveInputMessages.inputMustBeObject));
					process.exitCode = CommandExitCodes.InvalidInput;
					return false;
				}

				input = parsed;
				source = 'stdin';
			} catch (err) {
				logger.stderr.error(t(resolveInputMessages.cannotParseStdinJson, { message: (err as Error).message }));
				process.exitCode = CommandExitCodes.InvalidInput;
				return false;
			}
		}
	}

	if (inputFlag) {
		switch (inputFlag[0]) {
			case '-': {
				logger.stderr.error(t(resolveInputMessages.stdinDashRequiresPipe));
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
					// this also matches Windows paths
					path.isAbsolute(inputFlag) ||
					inputFlag.startsWith('./') ||
					inputFlag.startsWith('../') ||
					// Home directory access
					inputFlag.includes('~') ||
					// Windows-style path access
					inputFlag.startsWith('.\\') ||
					inputFlag.startsWith('..\\');

				if (fileExists || inputLooksLikePath) {
					logger.stderr.error(t(resolveInputMessages.inputFlagIsPath));
					process.exitCode = CommandExitCodes.InvalidInput;
					return false;
				}

				try {
					const parsed = JSON.parse(inputFlag);

					if (Array.isArray(parsed)) {
						logger.stderr.error(t(resolveInputMessages.inputMustBeObject));
						process.exitCode = CommandExitCodes.InvalidInput;
						return false;
					}

					input = parsed;
					source = 'input';
				} catch (err) {
					logger.stderr.error(
						t(resolveInputMessages.cannotParseInputJson, { message: (err as Error).message }),
					);
					process.exitCode = CommandExitCodes.InvalidInput;
					return false;
				}
			}
		}
	} else if (inputFileFlag) {
		switch (inputFileFlag[0]) {
			case '-': {
				logger.stderr.error(t(resolveInputMessages.inputFileDashRequiresPipe));
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
						logger.stderr.error(t(resolveInputMessages.inputMustBeObject));
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
							logger.stderr.error(t(resolveInputMessages.inputMustBeObject));
							process.exitCode = CommandExitCodes.InvalidInput;
							return false;
						}

						input = parsed;
						source = inputFileFlag;
					} catch {
						logger.stderr.error(
							t(resolveInputMessages.cannotReadInputFile, {
								fullPath,
								message: (fsError as Error).message,
							}),
						);
						process.exitCode = CommandExitCodes.InvalidInput;
						return false;
					}
				}
			}
		}
	}

	return input ? { input, source: source! } : undefined;
}
