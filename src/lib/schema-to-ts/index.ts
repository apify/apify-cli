/**
 * Public surface. Deliberately narrow: everything exported here becomes a compatibility
 * surface, and the parts left out — the IR, the emitter, the canonical serializer, the hash —
 * are precisely the parts we want free to change behind an `IR_VERSION` bump.
 *
 * Adding an export later is non-breaking; removing one is not.
 */

// Apify-aware rewrites. Separate calls, because the schema kind is not the core's business.
export { normalizeInputSchema } from './preprocess/input.js';
export { normalizeDatasetSchema } from './preprocess/dataset.js';

// Schema in, TypeScript out. The IR never crosses this boundary.
export { compile, check } from './compile.js';
export type { CheckResult, CompileOptions, CompileResult } from './compile.js';
export type { Variant } from './emit.js';
export type { CheckReason, Header } from './check.js';
export type { Diagnostic, Notice } from './diagnostics.js';

// Answers "is this file ours?" without needing a schema.
export { readHeader } from './check.js';
