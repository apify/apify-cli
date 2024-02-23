import { ApifyCommand } from '../../lib/apify_command.js';

export class ActorIndexCommand extends ApifyCommand<typeof ActorIndexCommand> {
    static override description = 'Commands are designed to be used in Actor runs. All commands are in PoC state, do not use in production environments.\n';
    async run() {
        await this.printHelp();
    }
}
