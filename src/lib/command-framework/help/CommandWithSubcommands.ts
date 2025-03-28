/*
Manages secure environment variables for Actors.

USAGE
  $ apify secrets

DESCRIPTION
  Manages secure environment variables for Actors.

  Example:
  $ apify secrets add mySecret TopSecretValue123

  The "mySecret" value can be used in an environment variable defined in '.actor/actor.json' file by adding the "@"
  prefix:

  {
  "actorSpecification": 1,
  "name": "my_actor",
  "environmentVariables": { "SECRET_ENV_VAR": "@mySecret" },
  "version": "0.1"
  }

  When the Actor is pushed to Apify cloud, the "SECRET_ENV_VAR" and its value is stored as a secret environment variable
  of the Actor.

COMMANDS
  secrets add  Adds a new secret to '~/.apify' for use in Actor environment variables.
  secrets rm   Permanently deletes a secret from your stored credentials.
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
