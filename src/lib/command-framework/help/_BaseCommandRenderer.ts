import chalk from 'chalk';
import indent from 'indent-string';
import width from 'string-width';
import wrap from 'wrap-ansi';

import { type BuiltApifyCommand, camelCaseToKebabCase, kebabCaseString } from '../apify-command.js';
import type { FlagTag, TaggedFlagBuilder } from '../flags.js';

export abstract class BaseCommandRenderer {
	protected readonly command: typeof BuiltApifyCommand;

	protected maxLineWidth: number;

	protected entrypoint: string;

	public constructor(entrypoint: string, command: typeof BuiltApifyCommand) {
		this.entrypoint = entrypoint;
		this.command = command;
		const override = Number(process.env.APIFY_CLI_MAX_LINE_WIDTH);

		if (!Number.isNaN(override)) {
			this.maxLineWidth = override;
		} else if (!process.stdout.isTTY) {
			this.maxLineWidth = 80;
		} else {
			const windowWidth = process.stdout.getWindowSize?.()[0] ?? -1;

			if (windowWidth < 1) {
				this.maxLineWidth = 80;
			} else if (windowWidth < 40) {
				this.maxLineWidth = 40;
			} else {
				this.maxLineWidth = windowWidth;
			}
		}
	}

	public abstract render(): string;

	protected pushShortDescription(result: string[]) {
		if (this.command.shortDescription) {
			result.push(this.command.shortDescription, '');
			// Fallback to first line of description
		} else if (this.command.description) {
			result.push(this.command.description.split('\n')[0], '');
		}
	}

	protected pushDescription(result: string[]) {
		if (!this.command.description) {
			return;
		}

		result.push(chalk.bold('DESCRIPTION'));

		const wrapped = wrap(this.command.description, this.maxLineWidth - 2, { trim: false });

		const indented = indent(wrapped, 2);

		result.push(indented);
		result.push('');
	}

	protected pushNewLineBeforeNewEntryIfLengthIsPastTheLimit({
		state,
		itemToAdd,
		indentSize,
	}: { state: string[]; itemToAdd: string; indentSize: number }) {
		// Check the _last line_ of the state, not the whole string, as otherwise we get false positives
		const currentLength = width(state.join(' ').split('\n').at(-1) || '') + indentSize;

		const sizeOfItemToAdd = width(itemToAdd);

		if (currentLength + sizeOfItemToAdd > this.maxLineWidth) {
			state.push('\n');
		}

		state.push(itemToAdd);
	}

	protected kebabFlagName(flagName: string) {
		return kebabCaseString(camelCaseToKebabCase(flagName)).toLowerCase();
	}

	protected makeFlagString(flagName: string, flag: TaggedFlagBuilder<FlagTag, unknown, unknown, unknown>) {
		const flagKey = this.kebabFlagName(flagName);

		const mainFlagPart = flag.char ? `-${flag.char}` : `--${flagKey}`;

		switch (flag.flagTag) {
			case 'boolean': {
				return mainFlagPart;
			}

			case 'string':
			case 'integer': {
				return `${mainFlagPart} <value>`;
			}

			default: {
				throw new RangeError(`Unhandled flag type: ${flag.flagTag}`);
			}
		}
	}
}
