import { AGENT_ENV_VARS } from '../src/lib/nonInteractiveMode.js';

// Clear agent env vars so isNonInteractive() starts clean regardless of the host environment (e.g. CLAUDECODE is set inside Claude Code).
for (const [envVar] of AGENT_ENV_VARS) {
	delete process.env[envVar];
}
