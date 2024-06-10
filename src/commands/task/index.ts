import { ApifyCommand } from '../../lib/apify_command.js';

export class TasksIndexCommand extends ApifyCommand<typeof TasksIndexCommand> {
    static override description = 'Commands are designed to be used to interact with Tasks.';
    async run() {
        await this.printHelp();
    }
}
