const { Command, flags } = require('@oclif/command');
const { argsToCamelCase } = require('../lib/utils');

/**
 * Adding parsing flags to oclif Command class
 */
class ApifyCommand extends Command {

    constructor(argv, config) {
        super(argv, config);
    }

    parse(ApifyCommand) {
        const { flags, args } = super.parse(ApifyCommand);
        const parsedFlags = argsToCamelCase(flags);
        return {
            flags: parsedFlags,
            args,
        };
    }

}

module.exports = { ApifyCommand };
