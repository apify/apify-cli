import { ActorsPullCommand } from './actors/pull.js';

export class TopLevelPullCommand extends ActorsPullCommand {
	static override name = 'pull' as const;
}
