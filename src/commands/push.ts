import { ActorsPushCommand } from './actors/push.js';

export class ToplevelPushCommand extends ActorsPushCommand {
	static override name = 'push' as const;
}
