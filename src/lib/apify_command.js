const { Command } = require('@oclif/command');
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
}

module.exports = { ApifyCommand };
