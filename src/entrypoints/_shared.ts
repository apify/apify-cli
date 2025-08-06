import process from 'node:process';
import { parseArgs } from 'node:util';

import chalk from 'chalk';
import { satisfies } from 'semver';

import type { UpgradeCommand as TypeUpgradeCommand } from '../commands/cli-management/upgrade.js';
import type { BuiltApifyCommand } from '../lib/command-framework/apify-command.js';
import { commandRegistry, internalRunCommand } from '../lib/command-framework/apify-command.js';
import { CommandError } from '../lib/command-framework/CommandError.js';
import { renderMainHelpMenu } from '../lib/command-framework/help.js';
import { readStdin } from '../lib/commands/read-stdin.js';
import { SUPPORTED_NODEJS_VERSION } from '../lib/consts.js';
import { useCLIMetadata } from '../lib/hooks/useCLIMetadata.js';
import { shouldSkipVersionCheck } from '../lib/hooks/useCLIVersionCheck.js';
import { useCommandSuggestions } from '../lib/hooks/useCommandSuggestions.js';
import { error } from '../lib/outputs.js';
import { cliDebugPrint } from '../lib/utils/cliDebugPrint.js';

export const cachedStdinInput = await readStdin();

const cliMetadata = useCLIMetadata();

export const USER_AGENT = `Apify CLI/${cliMetadata.version} (https://github.com/apify/apify-cli)`;

export function processVersionCheck(cliName: string) {
	if (cliMetadata.installMethod === 'bundle') {
		return;
	}

	if (!satisfies(process.version, SUPPORTED_NODEJS_VERSION)) {
		error({
			message: `${cliName} CLI requires Node.js version ${SUPPORTED_NODEJS_VERSION}. Your current version is ${process.version}.`,
		});

		process.exit(1);
	}
}

export function printCLIVersionAndExitIfFlagUsed(parsed: TopLevelValues) {
	if (parsed.values.version === true && parsed.positionals.length === 0) {
		console.log(cliMetadata.fullVersionString);
		process.exit(0);
	}
}

export function printHelpAndExitIfFlagUsedOrNoCommandPassed(parsed: TopLevelValues, entrypoint: string) {
	// If we have the flag and no other command, or if we have no command at all
	if ((parsed.values.help === true && parsed.positionals.length === 0) || parsed.positionals.length === 0) {
		console.log(renderMainHelpMenu(entrypoint));
		process.exit(0);
	}
}

type TopLevelValues = ReturnType<
	typeof parseArgs<{
		allowPositionals: true;
		strict: false;
		options: {
			help: {
				type: 'boolean';
				short: string;
			};
			version: {
				type: 'boolean';
				short: string;
			};
		};
		args: string[];
	}>
>;

function handleCommandNotFound(commandName: string): never {
	const closestMatches = useCommandSuggestions(String(commandName));

	let message = chalk.gray(`Command ${chalk.whiteBright(commandName)} not found`);

	if (closestMatches.length) {
		message += '\n  ';
		message += chalk.gray(`Did you mean: ${closestMatches.map((cmd) => chalk.whiteBright(cmd)).join(', ')}?`);
	}

	error({ message });

	process.exit(1);
}

async function runVersionCheck(entrypoint: string, maybeCommandName?: string) {
	// START: VERSION CHECK //

	const UpgradeCommand = commandRegistry.get('upgrade') as typeof TypeUpgradeCommand;

	const checkVersionsCommandIds = [UpgradeCommand.name, ...(UpgradeCommand.aliases ?? [])];

	if (checkVersionsCommandIds.some((id) => maybeCommandName === id)) {
		cliDebugPrint('[VersionCheckMiddleware]', 'upgrade command detected, skipping version check');
		// Skip running the middleware
		return;
	}

	if (shouldSkipVersionCheck()) {
		cliDebugPrint('[VersionCheckMiddleware]', 'skipping version check because APIFY_CLI_SKIP_UPDATE_CHECK is set');
		// If the user has configured the `APIFY_CLI_SKIP_UPDATE_CHECK` env variable then skip the check.
		return;
	}

	await internalRunCommand(entrypoint, UpgradeCommand, { flags_internalAutomaticCall: true });
	// END: VERSION CHECK //
}

export async function runCLI(entrypoint: string) {
	cliDebugPrint('CLIMetadata', {
		...cliMetadata,
		fullVersionString: cliMetadata.fullVersionString,
		argv: process.argv,
		cwd: process.cwd(),
		execPath: process.execPath,
	});

	const startingArgs = process.argv.slice(2);

	cliDebugPrint('ProcessArgv', startingArgs);

	const startingResult = parseArgs({
		allowPositionals: true,
		strict: false,
		options: {
			help: {
				type: 'boolean',
				short: 'h',
			},
			version: {
				type: 'boolean',
				short: 'v',
			},
		},
		args: startingArgs,
	});

	printCLIVersionAndExitIfFlagUsed(startingResult);
	printHelpAndExitIfFlagUsedOrNoCommandPassed(startingResult, entrypoint);

	// MIDDLEWARE START //

	await runVersionCheck(entrypoint, startingResult.positionals[0]);

	// MIDDLEWARE END //

	cliDebugPrint('TopLevelOptions', startingResult);

	const [commandName, maybeSubcommandName] = startingResult.positionals;
	let hasSubcommand = false;

	const baseCommand = commandRegistry.get(commandName);

	if (!baseCommand) {
		return handleCommandNotFound(commandName);
	}

	let FinalCommand: typeof BuiltApifyCommand | undefined = baseCommand;

	if (baseCommand.subcommands?.length) {
		if (!maybeSubcommandName) {
			// Print help message for base command (also exits the process)
			return baseCommand.printHelp();
		}

		hasSubcommand = true;
		FinalCommand = commandRegistry.get(`${commandName} ${maybeSubcommandName}`);
	}

	if (!FinalCommand) {
		return handleCommandNotFound(`${commandName} ${maybeSubcommandName}`);
	}

	// Take in all the raw arguments as they were provided to the process, skipping the command name and subcommand name
	// All this tomfoolery is to ensure that if the arguments are something like [kvs, --json, ls], it'll parse correctly
	const rebuiltArgs: string[] = [...startingArgs];

	const commandNameIndex = rebuiltArgs.indexOf(commandName);
	cliDebugPrint('CommandNameIndex', commandNameIndex);
	rebuiltArgs.splice(commandNameIndex, 1);

	if (hasSubcommand) {
		const subcommandNameIndex = rebuiltArgs.indexOf(maybeSubcommandName);
		cliDebugPrint('SubcommandNameIndex', subcommandNameIndex);
		rebuiltArgs.splice(subcommandNameIndex, 1);
	}

	cliDebugPrint('RebuiltArgs', rebuiltArgs);
	cliDebugPrint('CommandToRun', FinalCommand);

	const instance = new FinalCommand(
		entrypoint,
		hasSubcommand ? `${baseCommand.name} ${maybeSubcommandName}` : baseCommand.name,
	);

	// eslint-disable-next-line dot-notation
	const parserOptions = instance['_buildParseArgsOption']();

	cliDebugPrint('ParserOptionsForCommand', parserOptions);

	try {
		const commandResult = parseArgs({
			...parserOptions,
			args: rebuiltArgs,
		});

		// eslint-disable-next-line dot-notation
		await instance['_run'](commandResult);

		cliDebugPrint('CommandArgsResult', commandResult);
	} catch (err) {
		const commandError = CommandError.into(err, FinalCommand);

		error({ message: commandError.getPrettyMessage() });

		process.exit(1);
	}
}
