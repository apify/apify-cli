/* eslint-disable max-classes-per-file */
import {
	ApifyCommand,
	type BuiltApifyCommand as _BuiltApifyCommand,
	commandRegistry,
} from '../../../src/lib/command-framework/apify-command.js';
import { useCommandSuggestions } from '../../../src/lib/hooks/useCommandSuggestions.js';

const BuiltApifyCommand = ApifyCommand as typeof _BuiltApifyCommand;

const subcommands = [
	class KVSGetValue extends BuiltApifyCommand {
		static override name = 'get-value';
	},
	class KVSSetValue extends BuiltApifyCommand {
		static override name = 'set-value';
	},
];

const fakeCommands = [
	class Help extends BuiltApifyCommand {
		static override name = 'help';
	},
	class Upgrade extends BuiltApifyCommand {
		static override name = 'upgrade';
		static override aliases = ['cv', 'check-version'];
	},
	class KeyValueStores extends BuiltApifyCommand {
		static override name = 'key-value-stores';
		static override aliases = ['kvs'];
		static override subcommands = subcommands;
	},
];

describe('useCommandSuggestions', () => {
	let existingCommands: [string, typeof BuiltApifyCommand][];

	beforeAll(() => {
		existingCommands = [...commandRegistry.entries()];

		commandRegistry.clear();

		for (const command of fakeCommands) {
			commandRegistry.set(command.name, command);

			if (command.aliases?.length) {
				for (const alias of command.aliases) {
					commandRegistry.set(alias, command);

					if (command.subcommands?.length) {
						for (const subcommand of command.subcommands) {
							commandRegistry.set(`${alias} ${subcommand.name}`, subcommand);
						}
					}
				}
			}

			if (command.subcommands?.length) {
				for (const subcommand of command.subcommands) {
					commandRegistry.set(`${command.name} ${subcommand.name}`, subcommand);

					if (command.aliases?.length) {
						for (const alias of command.aliases) {
							commandRegistry.set(`${command.name} ${alias}`, subcommand);
						}
					}
				}
			}
		}
	});

	afterAll(() => {
		commandRegistry.clear();

		for (const [name, command] of existingCommands) {
			commandRegistry.set(name, command);
		}
	});

	test.each([
		['hlp', 'help'],
		['kv', 'kvs (alias for key-value-stores)', 'cv (alias for upgrade)'],
		['key-value-stor', 'key-value-stores'],
		// assert order based on distance
		['kvs get-values', 'kvs get-value', 'kvs set-value'],
		['kvs set-values', 'kvs set-value', 'kvs get-value'],
	])('command suggestions for %s', (input, ...expected) => {
		const suggestions = useCommandSuggestions(input);

		expect(suggestions).toEqual(expected);
	});
});
