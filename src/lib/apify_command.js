const { Command } = require('@oclif/command');
const { finished } = require('stream');
const { promisify } = require('util');
const { argsToCamelCase } = require('./utils');
const { mixpanel, getOrCreateLocalDistinctId, isTelemetryEnabled } = require('./telemetry');
const { detectInstallationType } = require('./version_check');

/**
 * Adding parsing flags to oclif Command class
 */
class ApifyCommand extends Command {
    parse(cmd) {
        const { flags, args } = super.parse(cmd);
        let distinctId = null;
        const parsedFlags = argsToCamelCase(flags);

        if (isTelemetryEnabled) {
            distinctId = getOrCreateLocalDistinctId();
            const flagsUsed = Object.keys(parsedFlags);
            mixpanel.track('cli_command', {
                distinct_id: distinctId,
                command: cmd.id,
                flagsUsed,
                $os: process.platform,
                installationType: detectInstallationType(),
            });
        }

        return { flags: parsedFlags, args, distinctId };
    }

    /**
     * Reads data on standard input as a string.
     * @return {Promise<string|undefined>}
     */
    async readStdin(stdinStream) {
        // The isTTY params says if TTY is connected to the process, if so the stdout is
        // synchronous and the stdout steam is empty.
        // See https://nodejs.org/docs/latest-v12.x/api/process.html#process_a_note_on_process_i_o
        if (stdinStream.isTTY) return;

        const bufferChunks = [];
        stdinStream.on('data', (chunk) => {
            bufferChunks.push(chunk);
        });

        await promisify(finished)(stdinStream);
        return Buffer.concat(bufferChunks).toString('utf-8');
    }
}

module.exports = { ApifyCommand };
