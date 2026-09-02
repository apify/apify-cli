import { compareToHeader, type CheckReason } from './check.js';
import type { Diagnostic, Notice } from './diagnostics.js';
import { emit, type EmitOptions } from './emit.js';
import { jsonSchemaToIR } from './json-schema-to-ir.js';

/**
 * The public facade. Schema in, TypeScript out — the IR never crosses the boundary, so it
 * stays free to change behind an `IR_VERSION` bump.
 *
 * The schema kind is deliberately *not* a parameter: preprocessing is a separate call, so
 * these take whatever `normalizeInputSchema` / `normalizeDatasetSchema` produced.
 */
export type CompileOptions = EmitOptions;

export interface CompileResult {
	/** Complete file text, header included. Never written anywhere — this library does no IO. */
	source: string;
	/** Fidelity was lost: something is typed `unknown` that could have been precise. */
	diagnostics: Diagnostic[];
	/** Schema lint with no type impact. */
	notices: Notice[];
}

export function compile(schema: unknown, opts: CompileOptions): CompileResult {
	const { ir, diagnostics, notices } = jsonSchemaToIR(schema);
	return { source: emit(ir, opts), diagnostics, notices };
}

/**
 * Staleness and schema health are orthogonal, and both are available here for free — the
 * schema has to be lifted either way. A CLI typically fails on
 * `stale || diagnostics.some(d => d.severity === 'error')`.
 */
export interface CheckResult {
	stale: boolean;
	reason: CheckReason;
	/** Hash computed from the schema now. */
	expected: string;
	/** Hash read from the file, or null when there was no single header to read. */
	found: string | null;
	expectedVersion: number;
	foundVersion: number | null;
	diagnostics: Diagnostic[];
	notices: Notice[];
}

export function check(source: string, schema: unknown, opts: CompileOptions): CheckResult {
	const { ir, diagnostics, notices } = jsonSchemaToIR(schema);
	return { ...compareToHeader(source, ir, opts), diagnostics, notices };
}
