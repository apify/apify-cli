const { Command } = require('@oclif/command');
const { finished } = require('stream');
const { promisify } = require('util');
const { argsToCamelCase } = require('./utils');

/**
 * Adding parsing flags to oclif Command class
 */
class ApifyCommand extends Command {
    parse(cmd) {
        const { flags, args } = super.parse(cmd);
        const parsedFlags = argsToCamelCase(flags);
        return {
            flags: parsedFlags,
            args,
        };
    }

    /**
     * Reads data on standard input as a string.
     * @return {Promise<string|undefined>}
     */
    async readStdin(stdinStream) {
        // See https://nodejs.org/docs/latest-v12.x/api/tty.html#tty_readstream_istty
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
