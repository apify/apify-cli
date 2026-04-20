/* eslint-disable max-classes-per-file */
import stripAnsi from 'strip-ansi';

import {
	ApifyCommand,
	type BuiltApifyCommand as _BuiltApifyCommand,
	commandRegistry,
} from '../../../../src/lib/command-framework/apify-command.js';
import {
	registerCommandForHelpGeneration,
	renderHelpForCommand,
	renderMainHelpMenu,
} from '../../../../src/lib/command-framework/help.js';

const BuiltApifyCommand = ApifyCommand as typeof _BuiltApifyCommand;

// Pin the wrap width so rendered output is deterministic across environments.
process.env.APIFY_CLI_MAX_LINE_WIDTH = '200';

class FakeRunsAbort extends BuiltApifyCommand {
	static override name = 'abort' as const;
	static override description = 'Aborts an Actor run.';
	static override examples = [
		{
			description: 'Abort a running Actor gracefully.',
			command: 'apify runs abort <runId>',
		},
	];

	static override docsUrl = 'https://example.com/runs-abort';
}

class FakeRunsIndex extends BuiltApifyCommand {
	static override name = 'runs' as const;
	static override description = 'Commands for managing Actor runs.';
	static override group = 'Apify Console';
	static override subcommands = [FakeRunsAbort];
	static override examples = [{ command: 'apify runs ls' }];
}

class FakeCreate extends BuiltApifyCommand {
	static override name = 'create' as const;
	static override description = 'Creates a new Actor project.';
	static override group = 'Local Actor Development';
	static override interactive = true;
	static override interactiveNote = 'Pass --template to skip the prompt.';
	static override examples = [{ command: 'apify create my-actor' }];
	static override docsUrl = 'https://example.com/create';
}

class FakeActorPushData extends BuiltApifyCommand {
	static override name = 'push-data' as const;
	static override description = "Saves data to the Actor's default dataset.";
	static override examples = [
		{
			description: 'Push a single item.',
			command: `actor push-data '{"key":"value"}'`,
		},
		{
			description: 'Push an array via stdin.',
			command: 'cat ./items.json | actor push-data',
		},
	];
}

class FakeUtility extends BuiltApifyCommand {
	static override name = 'utility' as const;
	static override description = 'A utility command.';
	// No group → should fall into OTHER.
}

class FakeInteractiveNamespace extends BuiltApifyCommand {
	static override name = 'login-wizard' as const;
	static override description = 'Commands for logging in interactively.';
	static override interactive = true;
	static override interactiveNote = 'Pass --token to skip prompts.';
	static override subcommands = [
		class extends BuiltApifyCommand {
			static override name = 'start' as const;
			static override description = 'Starts the wizard.';
		},
	];
}

describe('Help rendering', () => {
	let existingCommands: [string, typeof _BuiltApifyCommand][];

	beforeAll(() => {
		existingCommands = [...commandRegistry.entries()];
		commandRegistry.clear();

		// Register apify-side fakes.
		registerCommandForHelpGeneration('apify', FakeCreate);
		registerCommandForHelpGeneration('apify', FakeRunsIndex);
		registerCommandForHelpGeneration('apify', FakeUtility);
		registerCommandForHelpGeneration('apify', FakeInteractiveNamespace);

		// The `actor push-data` subcommand is registered twice with different entrypoints,
		// once as a subcommand of `apify actor` and once as a standalone `actor` command.
		// Only the second registration survives in the `commands` map, so test each case
		// separately below by re-registering with the desired entrypoint.
	});

	afterAll(() => {
		commandRegistry.clear();
		for (const [name, command] of existingCommands) {
			commandRegistry.set(name, command);
		}
	});

	describe('CommandHelp.render()', () => {
		test('renders USAGE, DESCRIPTION, EXAMPLES, and LEARN MORE sections', () => {
			registerCommandForHelpGeneration('apify', FakeCreate);
			const output = stripAnsi(renderHelpForCommand(FakeCreate));

			expect(output).toContain('USAGE');
			expect(output).toContain('$ apify create');
			expect(output).toContain('DESCRIPTION');
			expect(output).toContain('Creates a new Actor project.');
			expect(output).toContain('EXAMPLES');
			expect(output).toContain('$ apify create my-actor');
			expect(output).toContain('LEARN MORE');
			expect(output).toContain('https://example.com/create');
		});

		test('renders the interactive note for interactive commands', () => {
			registerCommandForHelpGeneration('apify', FakeCreate);
			const output = stripAnsi(renderHelpForCommand(FakeCreate));

			expect(output).toContain('[INTERACTIVE]');
			expect(output).toContain('NOTE');
			expect(output).toContain('Pass --template to skip the prompt.');
		});

		test('renders example descriptions as shell-style # comments', () => {
			registerCommandForHelpGeneration('apify', FakeRunsAbort);
			const output = stripAnsi(renderHelpForCommand(FakeRunsAbort));

			expect(output).toContain('# Abort a running Actor gracefully.');
			expect(output).toContain('$ apify runs abort <runId>');
		});
	});

	describe('CommandWithSubcommandsHelp.render()', () => {
		test('renders SUBCOMMANDS section with each child command', () => {
			registerCommandForHelpGeneration('apify', FakeRunsIndex);
			const output = stripAnsi(renderHelpForCommand(FakeRunsIndex));

			expect(output).toContain('SUBCOMMANDS');
			expect(output).toContain('runs abort');
			expect(output).toContain('Aborts an Actor run.');
		});

		test('renders interactive note for interactive namespace commands', () => {
			registerCommandForHelpGeneration('apify', FakeInteractiveNamespace);
			const output = stripAnsi(renderHelpForCommand(FakeInteractiveNamespace));

			expect(output).toContain('[INTERACTIVE]');
			expect(output).toContain('NOTE');
			expect(output).toContain('Pass --token to skip prompts.');
		});
	});

	describe('Example command normalization by entrypoint', () => {
		class FakeActor extends BuiltApifyCommand {
			static override name = 'actor' as const;
			static override description = 'Actor runtime commands.';
			static override subcommands = [FakeActorPushData];
		}

		test('prepends apify to bare "actor" examples when viewed under apify entrypoint', () => {
			// Registering under 'apify' re-registers FakeActorPushData as a subcommand with entrypoint "apify actor".
			registerCommandForHelpGeneration('apify', FakeActor);

			const output = stripAnsi(renderHelpForCommand(FakeActorPushData));

			// Leading bare "actor" form gets "apify " prepended.
			expect(output).toContain(`$ apify actor push-data '{"key":"value"}'`);
			// Piped "| actor" form is also rewritten to "| apify actor".
			expect(output).toContain('cat ./items.json | apify actor push-data');
			// The original bare forms should no longer appear standalone.
			expect(output).not.toMatch(/\$ actor push-data '\{"key":"value"\}'/);
		});

		test('leaves bare "actor" examples untouched when viewed under actor entrypoint', () => {
			// Re-register the same command directly under "actor".
			registerCommandForHelpGeneration('actor', FakeActorPushData);
			const output = stripAnsi(renderHelpForCommand(FakeActorPushData));

			expect(output).toContain(`$ actor push-data '{"key":"value"}'`);
			expect(output).toContain('cat ./items.json | actor push-data');
			expect(output).not.toContain('apify actor push-data');
		});
	});

	describe('renderMainHelpMenu()', () => {
		test('renders groups in canonical order with OTHER last', () => {
			// Re-register all fake commands so the main menu sees them.
			registerCommandForHelpGeneration('apify', FakeCreate);
			registerCommandForHelpGeneration('apify', FakeRunsIndex);
			registerCommandForHelpGeneration('apify', FakeUtility);

			const output = stripAnsi(renderMainHelpMenu('apify'));

			const devIdx = output.indexOf('LOCAL ACTOR DEVELOPMENT');
			const consoleIdx = output.indexOf('APIFY CONSOLE');
			const otherIdx = output.indexOf('OTHER');

			expect(devIdx).toBeGreaterThan(-1);
			expect(consoleIdx).toBeGreaterThan(-1);
			expect(otherIdx).toBeGreaterThan(-1);
			// Canonical order: Local Actor Development → Apify Console → … → OTHER.
			expect(devIdx).toBeLessThan(consoleIdx);
			expect(consoleIdx).toBeLessThan(otherIdx);
		});

		test('shows the apify preamble and canonical examples for the apify entrypoint', () => {
			const output = stripAnsi(renderMainHelpMenu('apify'));

			expect(output).toContain('Apify command-line interface (CLI)');
			expect(output).toContain('USAGE');
			expect(output).toContain('$ apify <command> [options]');
			expect(output).toContain('EXAMPLES');
			expect(output).toContain('$ apify login');
			expect(output).toContain("Use 'apify <command> --help'");
		});

		test('shows the actor preamble and canonical examples for the actor entrypoint', () => {
			const output = stripAnsi(renderMainHelpMenu('actor'));

			expect(output).toContain("'actor' is the runtime CLI");
			expect(output).toContain('$ actor <command> [options]');
			expect(output).toContain('$ actor get-input');
			expect(output).toContain("Use 'actor <command> --help'");
		});
	});
});
