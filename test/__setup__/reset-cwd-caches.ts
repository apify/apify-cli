import { cwdCache as actorConfigCache } from '../../src/lib/hooks/useActorConfig.js';
import { cwdCache as cwdProjectCache } from '../../src/lib/hooks/useCwdProject.js';

export function resetCwdCaches() {
	actorConfigCache.clear();
	cwdProjectCache.clear();
}
