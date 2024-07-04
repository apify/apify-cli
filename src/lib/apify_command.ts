import process from 'node:process';

import { Command, type Interfaces, loadHelpClass } from '@oclif/core';

import { readStdin } from './commands/read-stdin.js';
import { COMMANDS_WITHIN_ACTOR, LANGUAGE } from './consts.js';
import { maybeTrackTelemetry } from './telemetry.js';
import { type KeysToCamelCase, argsToCamelCase, detectLocalActorLanguage } from './utils.js';
import { detectInstallationType } from './version_check.js';

export type ApifyFlags<T extends typeof Command> = KeysToCamelCase<Interfaces.InferredFlags<T['flags']>>;
export type ApifyArgs<T extends typeof Command> = Interfaces.InferredArgs<T['args']>;

/**
 * Adding parsing flags to oclif Command class
 */
export abstract class ApifyCommand<T extends typeof Command> extends Command {
	protected telemetryData!: Record<string, unknown>;

	protected flags!: ApifyFlags<T>;
	protected args!: ApifyArgs<T>;

	override async init() {
		await super.init();

		const { args, flags } = await this.parse({
			flags: this.ctor.flags,
			args: this.ctor.args,
			strict: this.ctor.strict,
		});

		this.flags = argsToCamelCase(flags) as ApifyFlags<T>;
		this.args = args as ApifyArgs<T>;

		// Initialize telemetry data, all attributes are tracked in the finally method
		this.telemetryData = {
			flagsUsed: Object.keys(this.flags),
		};
	}

	override async finally(err?: Error) {
		const command = this.id;
		const eventData: Record<string, unknown> = {
			command,
			$os: this.config.platform,
			shell: this.config.shell,
			arch: this.config.arch,
			apifyCliVersion: this.config.version,
			nodeJsVersion: process.version,
			...this.telemetryData,
			error: err ? err.message : null,
		};

		try {
			eventData.installationType = detectInstallationType();
			if (!this.telemetryData.actorLanguage && command && COMMANDS_WITHIN_ACTOR.includes(command)) {
				const { language, languageVersion } = detectLocalActorLanguage(process.cwd());
				eventData.actorLanguage = language;
				if (language === LANGUAGE.NODEJS) {
					eventData.actorNodejsVersion = languageVersion;
				} else if (language === LANGUAGE.PYTHON) {
					eventData.actorPythonVersion = languageVersion;
				}
			}
			await maybeTrackTelemetry({
				eventName: `cli_command_${command}`,
				eventData,
			});
		} catch {
			// Ignore errors
		}

		return super.finally(err);
	}

	/**
	 * Reads data on standard input as a string.
	 */
	async readStdin(stdinStream: typeof process.stdin) {
		return readStdin(stdinStream);
	}

	async printHelp(customCommand?: string) {
		const HelpCommand = await loadHelpClass(this.config);
		const help = new HelpCommand(this.config);
		await help.showHelp([customCommand ?? this.id!]);
	}
}
