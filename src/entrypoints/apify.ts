#!/usr/bin/env node
import { apifyCommands } from '../commands/_apifyEntrypoint.js';
import { processVersionCheck, runCLI } from './_shared.js';

processVersionCheck('Apify');

// Register all commands
for (const CommandClass of apifyCommands) {
	CommandClass.registerCommand('apify');
}

await runCLI('apify');
