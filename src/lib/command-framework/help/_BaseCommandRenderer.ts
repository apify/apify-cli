import chalk from 'chalk';
import indent from 'indent-string';
import width from 'string-width';
import wrap from 'wrap-ansi';

import { type BuiltApifyCommand, camelCaseToKebabCase, kebabCaseString } from '../apify-command.js';
import type { FlagTag, TaggedFlagBuilder } from '../flags.js';
import { getMaxLineWidth } from './consts.js';

export interface SelectiveRenderOptions {
	showShortDescription?: boolean;
	showDescription?: boolean;
	showUsageString?: boolean;
	showSubcommands?: boolean;
	showExamples?: boolean;
	showLearnMore?: boolean;
}

export abstract class BaseCommandRenderer {
	protected readonly command: typeof BuiltApifyCommand;

	public readonly entrypoint: string;

	public constructor(entrypoint: string, command: typeof BuiltApifyCommand) {
		this.entrypoint = entrypoint;
		this.command = command;
	}

	public abstract render(): string;

	public abstract selectiveRender(options: SelectiveRenderOptions): string;

	protected pushShortDescription(result: string[]) {
		const interactiveLabel = this.command.interactive ? `${chalk.yellow('[INTERACTIVE]')} ` : '';

		if (this.command.shortDescription) {
			result.push(`${interactiveLabel}${this.command.shortDescription}`, '');
			// Fallback to first line of description
		} else if (this.command.description) {
			result.push(`${interactiveLabel}${this.command.description.split('\n')[0]}`, '');
		}
	}

	protected pushDescription(result: string[]) {
		if (!this.command.description) {
			return;
		}

		result.push(chalk.bold('DESCRIPTION'));

		const wrapped = wrap(this.command.description, getMaxLineWidth() - 2, { trim: false });

		const indented = indent(wrapped, 2);

		result.push(indented);
		result.push('');
	}

	protected pushExamples(result: string[]) {
		const { examples } = this.command;

		if (!examples?.length) {
			return;
		}

		result.push(chalk.bold('EXAMPLES'));

		for (const example of examples) {
			if (example.description) {
				// Render descriptions as shell-style `#` comments so each example is a
				// self-contained copy-paste block (matches the `gh` CLI convention and
				// prevents description prose from being mistaken for part of the command).
				// -4 leaves room for the 2-space indent plus the "# " prefix.
				const wrapped = wrap(example.description, getMaxLineWidth() - 4, { trim: false });
				const commented = wrapped
					.split('\n')
					.map((line) => `# ${line}`)
					.join('\n');
				const indented = indent(commented, 2);
				result.push(chalk.dim(indented));
			}

			result.push(`  $ ${example.command}`);
			result.push('');
		}
	}

	protected pushInteractiveNote(result: string[]) {
		if (!this.command.interactive) {
			return;
		}

		result.push(chalk.bold('NOTE'));

		const defaultNote =
			'This command prompts the user for input. To run non-interactively (e.g. in CI or from an AI agent), pass all required arguments and flags explicitly.';
		const note = this.command.interactiveNote || defaultNote;

		const wrapped = wrap(note, getMaxLineWidth() - 2, { trim: false });
		const indented = indent(wrapped, 2);

		result.push(indented);
		result.push('');
	}

	protected pushLearnMore(result: string[]) {
		if (!this.command.docsUrl) {
			return;
		}

		result.push(chalk.bold('LEARN MORE'));
		result.push(`  ${this.command.docsUrl}`);
		result.push('');
	}

	protected pushNewLineBeforeNewEntryIfLengthIsPastTheLimit({
		state,
		itemToAdd,
		indentSize,
	}: {
		state: string[];
		itemToAdd: string;
		indentSize: number;
	}) {
		// Check the _last line_ of the state, not the whole string, as otherwise we get false positives
		const currentLength = width(state.join(' ').split('\n').at(-1) || '') + indentSize;

		const sizeOfItemToAdd = width(itemToAdd);

		if (currentLength + sizeOfItemToAdd > getMaxLineWidth()) {
			state.push('\n');
		}

		state.push(itemToAdd);
	}

	protected kebabFlagName(flagName: string) {
		return kebabCaseString(camelCaseToKebabCase(flagName)).toLowerCase();
	}

	protected makeFlagString(flagName: string, flag: TaggedFlagBuilder<FlagTag, string[] | null, unknown, unknown>) {
		const flagKey = this.kebabFlagName(flagName);

		const mainFlagPart = flag.char ? `-${flag.char}` : `--${flagKey}`;

		switch (flag.flagTag) {
			case 'boolean': {
				return mainFlagPart;
			}

			case 'string':
			case 'integer': {
				const flagValues = flag.choices?.length ? `${flag.choices.join('|')}` : '<value>';

				return `${mainFlagPart} ${flagValues}`;
			}

			default: {
				throw new RangeError(`Unhandled flag type: ${flag.flagTag}`);
			}
		}
	}
}
