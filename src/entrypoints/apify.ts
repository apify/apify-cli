import { satisfies } from 'semver';

import { cli } from './_shared.js';
import { apifyCommands } from '../commands/_register.js';
import { SUPPORTED_NODEJS_VERSION } from '../lib/consts.js';
import { error } from '../lib/outputs.js';

if (!satisfies(process.version, SUPPORTED_NODEJS_VERSION)) {
	error({
		message: `Apify CLI requires Node.js version ${SUPPORTED_NODEJS_VERSION}. Your current version is ${process.version}.`,
	});

	process.exit(1);
}

// Register all commands
for (const CommandClass of apifyCommands) {
	CommandClass.registerCommand(cli);
}

const parsed = await cli.parse(process.argv.slice(2));

if (parsed._.length === 0) {
	// TODO: print help
	// console.error('Unknown command, oh my');
	// cli.showHelp();
}
