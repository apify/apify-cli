import { satisfies } from 'semver';

import { cli, printCLIVersionAndExit } from './_shared.js';
import { apifyCommands } from '../commands/_register.js';
import { CheckVersionCommand } from '../commands/check-version.js';
import { SUPPORTED_NODEJS_VERSION } from '../lib/consts.js';
import { error } from '../lib/outputs.js';
import { checkLatestVersion, SKIP_UPDATE_CHECK } from '../lib/version_check.js';

if (!satisfies(process.version, SUPPORTED_NODEJS_VERSION)) {
	error({
		message: `Apify CLI requires Node.js version ${SUPPORTED_NODEJS_VERSION}. Your current version is ${process.version}.`,
	});

	process.exit(1);
}

cli.middleware(async (argv) => {
	const checkVersionsCommandIds = [CheckVersionCommand.name, ...CheckVersionCommand.aliases];

	if (checkVersionsCommandIds.some((id) => argv._[0] === id)) {
		// Skip running the middleware
		return;
	}

	// If the user has configured the `APIFY_CLI_SKIP_UPDATE_CHECK` env variable then skip the check.
	if (SKIP_UPDATE_CHECK) {
		return;
	}

	await checkLatestVersion();
});

// Register all commands
for (const CommandClass of apifyCommands) {
	CommandClass.registerCommand(cli);
}

const parsed = await cli.parse(process.argv.slice(2));

if (parsed._.length === 0) {
	if (parsed.v === true || parsed.version === true) {
		printCLIVersionAndExit();
	}

	console.log({ parsed });
	// TODO: print help
	// console.error('Unknown command, oh my');
	// cli.showHelp();
}
