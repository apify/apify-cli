import { createHash } from 'node:crypto';

import { canonical } from './canonical.js';
import { type EmitOptions } from './emit.js';
import { type IRRoot } from './ir.js';

/**
 * `node:crypto` is a builtin, not a dependency, so the zero-runtime-dependency rule holds.
 * Truncated to 16 hex chars: the threat model is accidental collision on a per-file identity
 * check, and the failure mode of a collision is a missed drift warning, not corruption.
 */
export const HASH_LENGTH = 16;

export function irHash(ir: IRRoot, opts: EmitOptions): string {
	return createHash('sha256').update(canonical(ir, opts)).digest('hex').slice(0, HASH_LENGTH);
}
