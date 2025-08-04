import chalk from 'chalk';

import { cachedStdinInput } from '../../entrypoints/_shared.js';
import { useCLIMetadata } from '../hooks/useCLIMetadata.js';

export enum CommandErrorCode {
	NODEJS_ERR_PARSE_ARGS_INVALID_OPTION_VALUE,
	NODEJS_ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL,
	NODEJS_ERR_PARSE_ARGS_UNKNOWN_OPTION,
	/**
	 * Used when a flag is provided multiple times
	 */
	APIFY_FLAG_PROVIDED_MULTIPLE_TIMES,
	/**
	 * Used when a flag is provided with an invalid value (for example, an integer flag that cannot be parsed as an integer)
	 */
	APIFY_INVALID_FLAG_INTEGER_VALUE,
	/**
	 * Used for options that have a list of choices, and the user provided one is not one of them
	 */
	APIFY_INVALID_CHOICE,
	/**
	 * Used when a flag is required but not provided
	 */
	APIFY_MISSING_FLAG,
	APIFY_UNKNOWN_ERROR,
}

export interface FlagData {
	name: string;
	expectsValue: boolean;
	ambiguousFlag?: string;
	ambiguousMessage?: string;
}
export interface CommandErrorOptions {
	code: CommandErrorCode;
	message?: string;
	metadata?: CommandError['metadata'];
}

export class CommandError extends Error {
	public readonly code: CommandErrorCode;

	public readonly metadata: Record<string, string | string[] | boolean>;

	public constructor({ code, message = '', metadata = {} }: CommandErrorOptions) {
		super(message || String(CommandErrorCode[code]));
		this.code = code;
		this.metadata = metadata;
	}

	public extractFlagNameFromMessage(): FlagData {
		switch (this.code) {
			case CommandErrorCode.NODEJS_ERR_PARSE_ARGS_INVALID_OPTION_VALUE: {
				const match =
					/'(?:-[a-z], )?--(?<flagName>[a-zA-Z]+)(?: <value>)?' (?<noArg>does not take)?(?<missingArg>argument missing)?(?<ambiguous>argument is ambiguous\.(?<ambiguousMessage>\s*.*\s*.*)?)?/gi.exec(
						this.message,
					);

				if (!match) {
					throw new Error(
						`Encountered unparsable error message from argument parser: ${this.message}.\n\nPlease report this issue at https://github.com/apify/apify-cli/issues`,
					);
				}

				const flagData: FlagData = {
					name: match.groups!.flagName,
					expectsValue: match.groups!.noArg === undefined,
					ambiguousFlag: match.groups!.ambiguous ? match.groups!.ambiguous : undefined,
					ambiguousMessage: match.groups!.ambiguousMessage
						? match.groups!.ambiguousMessage.trim()
						: undefined,
				};

				return flagData;
			}
			default: {
				throw new Error('Not implemented');
			}
		}
	}

	public getPrettyMessage(): string {
		switch (this.code) {
			case CommandErrorCode.NODEJS_ERR_PARSE_ARGS_INVALID_OPTION_VALUE: {
				const flagData = this.extractFlagNameFromMessage();

				return CommandError.buildMessageFromFlagData(flagData);
			}

			case CommandErrorCode.APIFY_FLAG_PROVIDED_MULTIPLE_TIMES: {
				const flagName = `--${this.metadata.flag}`;

				return chalk.gray(`Flag ${chalk.white.bold(flagName)} can only be specified once.`);
			}

			case CommandErrorCode.APIFY_INVALID_FLAG_INTEGER_VALUE: {
				const flagName = `--${this.metadata.flag}`;
				const value = chalk.whiteBright(String(this.metadata.value));

				return chalk.gray(
					`The provided value for the '${chalk.white.bold(flagName)}' flag could not be processed as an integer. Received: ${value}.`,
				);
			}

			case CommandErrorCode.APIFY_MISSING_FLAG: {
				const { flag, matcher, providedButReceivedNoValue } = this.metadata as {
					flag: string;
					matcher?: string;
					providedButReceivedNoValue?: boolean;
				};

				let flagName = `'${chalk.white.bold(`--${flag}`)}'`;

				if (matcher) {
					flagName = `${flagName} (alias used: '${chalk.white.bold(`--${matcher}`)}')`;
				}

				if (providedButReceivedNoValue) {
					return chalk.gray(
						`Flag ${flagName} was provided, but no value was received. Did you mean to pass the value as an argument or through standard input?`,
					);
				}

				return chalk.gray(`Flag '${flagName}' is required, but was not provided.`);
			}

			default: {
				const cliMetadata = useCLIMetadata();

				return [
					'The CLI encountered an unhandled argument parsing error!',
					`Please report this issue at https://github.com/apify/apify-cli/issues, and provide the following information:`,
					'',
					`- Error code: ${this.code} (${CommandErrorCode[this.code]})`,
					`- Error metadata: ${JSON.stringify(this.metadata)}`,
					'',
					`- Stack:\n${this.stack}`,
					'',
					'- Arguments (!!!only provide these as is if there is no sensitive information!!!):',
					`  ${JSON.stringify(process.argv.slice(2))}`,
					'',
					`- CLI version: \`${cliMetadata.fullVersionString}\``,
					`- CLI debug logs (process.env.APIFY_CLI_DEBUG): ${process.env.APIFY_CLI_DEBUG ? 'Enabled' : 'Disabled'}`,
					`- Stdin data? ${cachedStdinInput ? 'Yes' : 'No'}`,
				].join('\n');
			}
		}
	}

	static buildMessageFromFlagData(flagData: FlagData): string {
		const base = [`Flag ${chalk.white.bold(`--${flagData.name}`)}`];

		if (flagData.ambiguousFlag) {
			base.push(`is ambiguous (meaning the provided value could be interpreted as a flag too).`);

			if (flagData.ambiguousMessage) {
				base.push(`\n${flagData.ambiguousMessage}`);
			} else {
				base.push(`To solve this, provide the flag like this: --${flagData.name}=<value>`);
			}
		} else if (flagData.expectsValue) {
			base.push('expects a value');
		} else {
			base.push('does not take an argument');
		}

		return base.map((part) => chalk.gray(part)).join(' ');
	}

	static into(error: unknown): CommandError {
		if (error instanceof CommandError) {
			return error;
		}

		if (error instanceof Error && 'code' in error) {
			const casted = error as Error & { code: string };

			switch (casted.code) {
				case 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE': {
					return new CommandError({
						code: CommandErrorCode.NODEJS_ERR_PARSE_ARGS_INVALID_OPTION_VALUE,
						message: casted.message,
					});
				}
				case 'ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL': {
					return new CommandError({
						code: CommandErrorCode.NODEJS_ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL,
						message: casted.message,
					});
				}
				case 'ERR_PARSE_ARGS_UNKNOWN_OPTION': {
					return new CommandError({
						code: CommandErrorCode.NODEJS_ERR_PARSE_ARGS_UNKNOWN_OPTION,
						message: casted.message,
					});
				}
				default: {
					return new CommandError({
						code: CommandErrorCode.APIFY_UNKNOWN_ERROR,
						message: `Unknown error: ${error instanceof Error ? error.message : String(error)}`,
					});
				}
			}
		}

		return new CommandError({
			code: CommandErrorCode.APIFY_UNKNOWN_ERROR,
			message: `Unknown error: ${error instanceof Error ? error.message : String(error)}`,
		});
	}
}
