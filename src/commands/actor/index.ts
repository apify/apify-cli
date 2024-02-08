import { Command } from '@oclif/core';

import { showHelpForCommand } from '../../lib/utils.js';

export class ActorIndexCommand extends Command {
    static override description = 'Commands are designed to be used in Actor runs. All commands are in PoC state, do not use in production environments.\n';
    async run() {
        showHelpForCommand('actor');
    }
}
