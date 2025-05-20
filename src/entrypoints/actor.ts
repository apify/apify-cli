#!/usr/bin/env node
import { satisfies } from 'semver';

import { actorCommands } from '../commands/_register.js';
import { SUPPORTED_NODEJS_VERSION } from '../lib/consts.js';
import { error } from '../lib/outputs.js';
import { cli, runCLI } from './_shared.js';

cli.scriptName('actor');

if (!satisfies(process.version, SUPPORTED_NODEJS_VERSION)) {
	error({
		message: `Actor CLI requires Node.js version ${SUPPORTED_NODEJS_VERSION}. Your current version is ${process.version}.`,
	});

	process.exit(1);
}

// Register all commands
for (const CommandClass of actorCommands) {
	CommandClass.registerCommand('actor', cli);
}

await runCLI('actor');
