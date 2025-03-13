import { ActorsCallCommand } from './actors/call.js';

export class TopLevelCallCommand extends ActorsCallCommand {
	static override name = 'call';
}
