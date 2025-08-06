#!/usr/bin/env node
import { actorCommands } from '../commands/_register.js';
import { processVersionCheck, runCLI } from './_shared.js';

processVersionCheck('Actor');

// Register all commands
for (const CommandClass of actorCommands) {
	CommandClass.registerCommand('actor');
}

await runCLI('actor');
