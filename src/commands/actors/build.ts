import { OverrideClassName } from '../../lib/types.js';
import { BuildsCreateCommand } from '../builds/create.js';

export class ActorsBuildCommand extends OverrideClassName(BuildsCreateCommand) {
	static override name = 'build' as const;
}
