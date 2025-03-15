import process from 'node:process';

import yargonaut from 'yargonaut';
import yargs from 'yargs/yargs';

import { version } from '../lib/consts.js';

yargonaut //
	.style('blue')
	.style('yellow', 'required')
	.helpStyle('green')
	.errorsStyle('red');

export const cli = yargs()
	.scriptName('apify')
	.version(version)
	// This needs to be manually handled, as setting it here will override any `-v` flags used in commands (e.g: `apify runs info -v`)
	// .alias('v', 'version')
	// TODO: we can override the help message by disabling the built in help flag, then implementing it on the commands
	// .help()
	// TODO: if we set `h` here, no commands can use `h` as a char for a flag, unless we manually handle help messages ourselves
	.alias('h', 'help')
	.wrap(Math.max(80, process.stdout.columns || 80))
	.parserConfiguration({
		// Disables the automatic conversion of `--foo-bar` to `fooBar` (we handle it manually)
		'camel-case-expansion': false,
		// `--foo.bar` is not allowed
		'dot-notation': false,
		// We parse numbers manually
		'parse-numbers': false,
		'parse-positional-numbers': false,
	})
	.strictCommands()
	.updateStrings({
		'Positionals:': 'Arguments:',
	});

// @ts-expect-error @types/yargs is outdated -.-
cli.usageConfiguration({ 'hide-types': true });

export function printCLIVersionAndExit(): never {
	console.log(version);
	process.exit(0);
}
