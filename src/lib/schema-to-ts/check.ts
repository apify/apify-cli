import { HEADER_PREFIX, HEADER_SUFFIX, type EmitOptions } from './emit.js';
import { irHash } from './hash.js';
import { IR_VERSION, type IRRoot } from './ir.js';

/**
 * Drift detection without parsing TypeScript. The generated file carries a planted
 * fingerprint, so the check is immune to whatever a formatter did to the body.
 *
 * The hash pattern is deliberately loose (`[0-9a-f]+`, not a fixed length) and so is the
 * version: a file written by a future version must still parse far enough for us to *report*
 * the version mismatch rather than fail to recognise the header at all.
 *
 * Scanning the whole file rather than the leading comment block means a CLI-prepended banner
 * (an eslint-disable, a license header) costs nothing.
 */
const HEADER_RE = new RegExp(
	`^${escapeRegExp(HEADER_PREFIX)} v(\\d+)-([0-9a-f]+) — ${escapeRegExp(HEADER_SUFFIX)}\\r?$`,
	'gm',
);

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface Header {
	version: number;
	hash: string;
	/** Byte offset of the header line, so a CLI can point at it. */
	index: number;
}

export type CheckReason =
	| 'match'
	| 'hash-mismatch' // regenerate
	| 'missing-header' // not ours — refuse to overwrite without --force
	| 'duplicate-header' // two headers, most likely a botched merge
	| 'version-mismatch'; // regenerate, and expect a real diff

export interface Comparison {
	stale: boolean;
	reason: CheckReason;
	/** Hash computed from the schema now. */
	expected: string;
	/** Hash read out of the file, or null when there was no single header to read. */
	found: string | null;
	expectedVersion: number;
	foundVersion: number | null;
}

/** Every header in the file. More than one means the file is corrupt. */
export function readHeaders(source: string): Header[] {
	// Fresh lastIndex per call: the regex is module-level and `g` makes matchAll stateful.
	HEADER_RE.lastIndex = 0;
	return [...source.matchAll(HEADER_RE)].map((match) => ({
		version: Number(match[1]),
		hash: match[2]!,
		index: match.index,
	}));
}

/** The sole header, or null when there is none — or more than one. */
export function readHeader(source: string): Header | null {
	const headers = readHeaders(source);
	return headers.length === 1 ? headers[0]! : null;
}

/** IR-level comparison. The public `check` in compile.ts lifts a schema and calls this. */
export function compareToHeader(source: string, ir: IRRoot, opts: EmitOptions): Comparison {
	const expected = irHash(ir, opts);
	const headers = readHeaders(source);

	const base = { expected, expectedVersion: IR_VERSION };
	if (headers.length === 0) {
		return { ...base, stale: true, reason: 'missing-header', found: null, foundVersion: null };
	}
	if (headers.length > 1) {
		// Which one is authoritative is unknowable, so report neither.
		return { ...base, stale: true, reason: 'duplicate-header', found: null, foundVersion: null };
	}

	const header = headers[0]!;
	const found = { found: header.hash, foundVersion: header.version };

	// Version first: hashes from different versions are not comparable, because the canonical
	// form itself may have changed meaning.
	if (header.version !== IR_VERSION) {
		return { ...base, ...found, stale: true, reason: 'version-mismatch' };
	}
	if (header.hash !== expected) {
		return { ...base, ...found, stale: true, reason: 'hash-mismatch' };
	}
	return { ...base, ...found, stale: false, reason: 'match' };
}
