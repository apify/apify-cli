/*
Manage the environment variables of an Actor version on the Apify platform, and keep them in sync with a local .env file.

DESCRIPTION
  Manage the environment variables of an Actor version on the Apify platform, and keep them in sync with a local .env
  file. Changes need a rebuild before runs see them.

SUBCOMMANDS
  env ls       Lists the env vars of an Actor version on the Apify platform. Secret values stay hidden.
  env rm       Deletes an env var from an Actor version.

LEARN MORE
  https://docs.apify.com/cli/docs/reference#apify-env
*/

import chalk from 'chalk';
import indentString from 'indent-string';
import widestLine from 'widest-line';
import wrapAnsi from 'wrap-ansi';

import { BaseCommandRenderer, type SelectiveRenderOptions } from './_BaseCommandRenderer.js';
import { getMaxLineWidth } from './consts.js';

export class CommandWithSubcommandsHelp extends BaseCommandRenderer {
	public render() {
		const result: string[] = [];

		this.pushShortDescription(result);

		if (this.command.description) {
			this.pushDescription(result);
		}

		this.pushSubcommands(result);

		this.pushExamples(result);

		this.pushInteractiveNote(result);

		this.pushLearnMore(result);

		return result.join('\n').trim();
	}

	public selectiveRender(options: SelectiveRenderOptions): string {
		const result: string[] = [];

		if (options.showShortDescription) {
			this.pushShortDescription(result);
		}

		if (options.showDescription && this.command.description) {
			this.pushDescription(result);
		}

		if (options.showSubcommands) {
			this.pushSubcommands(result);
		}

		if (options.showExamples) {
			this.pushExamples(result);
		}

		if (options.showLearnMore) {
			this.pushLearnMore(result);
		}

		return result.join('\n').trim();
	}

	protected pushSubcommands(result: string[]) {
		if (!this.command.subcommands?.length) {
			return;
		}

		result.push(chalk.bold('SUBCOMMANDS'));

		const widestSubcommandNameLength = widestLine(
			this.command.subcommands.map((subcommand) => `${this.command.name} ${subcommand.name}`).join('\n'),
		);

		for (const subcommand of this.command.subcommands) {
			const shortDescription = subcommand.shortDescription || subcommand.description?.split('\n')[0] || '';

			const fullString = `${this.command.name} ${subcommand.name.padEnd(widestSubcommandNameLength - this.command.name.length - 1)}  ${shortDescription}`;

			const wrapped = wrapAnsi(fullString, getMaxLineWidth() - widestSubcommandNameLength - 2);

			const indented = indentString(wrapped, widestSubcommandNameLength + 2 + 2).trim();

			result.push(`  ${indented}`);
		}

		result.push('');
	}
}
