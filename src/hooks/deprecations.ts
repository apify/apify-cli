import process from 'node:process';

import type { Hook } from '@oclif/core';

import { warning } from '../lib/outputs.js';

// TODO: this will probably not work for commands that are namespaced, e.g. `actor call`
const deprecations: Record<string, string> = {
	vis: 'validate-schema',
};

const hook: Hook<'prerun'> = async (params) => {
	const possibleValidCommand = [params.Command.id, ...params.Command.aliases, ...params.Command.hiddenAliases];

	const usedCommand = process.argv.find((arg) => possibleValidCommand.includes(arg));

	if (usedCommand) {
		const validCommand = deprecations[usedCommand];

		if (validCommand) {
			warning({ message: `The command "${usedCommand}" is deprecated. Please use "${validCommand}" instead.` });
		}
	}
};

export default hook;
