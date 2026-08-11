#!/usr/bin/env node
import { actorCommands, apifyCommands } from '../commands/_register.js';
import { processVersionCheck, resolveEntrypoint, runCLI } from './_shared.js';

// A single bundle now powers both the `apify` and `actor` CLIs. The wrapper scripts created during
// install set `APIFY_CLI_ENTRYPOINT` to pick which command set to expose (see `resolveEntrypoint`).
const entrypoint = resolveEntrypoint();

processVersionCheck(entrypoint === 'apify' ? 'Apify' : 'Actor');

// Register the command set matching the resolved entrypoint
for (const CommandClass of entrypoint === 'apify' ? apifyCommands : actorCommands) {
	CommandClass.registerCommand(entrypoint);
}

await runCLI(entrypoint);
