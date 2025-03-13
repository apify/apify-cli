import { BuildsCreateCommand } from '../builds/create.js';

export class ActorsBuildCommand extends BuildsCreateCommand {
	static override name = 'build';
}
