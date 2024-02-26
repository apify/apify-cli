import process from 'node:process';
import { finished } from 'node:stream/promises';

import { Command, Interfaces, loadHelpClass } from '@oclif/core';

import { COMMANDS_WITHIN_ACTOR, LANGUAGE } from './consts.js';
import { maybeTrackTelemetry } from './telemetry.js';
import { KeysToCamelCase, argsToCamelCase, detectLocalActorLanguage } from './utils.js';
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
        // The isTTY params says if TTY is connected to the process, if so the stdout is
        // synchronous and the stdout steam is empty.
        // See https://nodejs.org/docs/latest-v12.x/api/process.html#process_a_note_on_process_i_o
        if (stdinStream.isTTY) return;

        const bufferChunks: Buffer[] = [];
        stdinStream.on('data', (chunk) => {
            bufferChunks.push(chunk);
        });

        await finished(stdinStream);
        return Buffer.concat(bufferChunks).toString('utf-8');
    }

    async printHelp(customCommand?: string) {
        const HelpCommand = await loadHelpClass(this.config);
        const help = new HelpCommand(this.config);
        await help.showHelp([customCommand ?? this.id!]);
    }
}
