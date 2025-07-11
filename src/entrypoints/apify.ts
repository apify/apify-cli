#!/usr/bin/env node
import { apifyCommands } from '../commands/_register.js';
import { cli, processVersionCheck, runCLI } from './_shared.js';

processVersionCheck('Apify');

// Register all commands
for (const CommandClass of apifyCommands) {
	CommandClass.registerCommand('apify', cli);
}

await runCLI('apify');
