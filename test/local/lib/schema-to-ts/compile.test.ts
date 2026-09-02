// oxlint-disable import/default -- `?raw` is a Vite import; the rule resolves it to the .ts file and finds no default.
import { describe, expect, test } from 'vitest';

import {
	check,
	compile,
	normalizeDatasetSchema,
	normalizeInputSchema,
	type CompileOptions,
} from '../../../../src/lib/schema-to-ts/index.js';
import datasetCommentScraper from '../../__fixtures__/lib/schema-to-ts/dataset/comment-scraper.json' with { type: 'json' };
import datasetGooglePlaces from '../../__fixtures__/lib/schema-to-ts/dataset/google-places.json' with { type: 'json' };
import datasetTiktokFollowers from '../../__fixtures__/lib/schema-to-ts/dataset/tiktok-followers-scraper.json' with { type: 'json' };
import datasetCommentScraperExpected from '../../__fixtures__/lib/schema-to-ts/expected/dataset/comment-scraper.ts?raw';
import datasetGooglePlacesExpected from '../../__fixtures__/lib/schema-to-ts/expected/dataset/google-places.ts?raw';
import datasetTiktokFollowersExpected from '../../__fixtures__/lib/schema-to-ts/expected/dataset/tiktok-followers-scraper.ts?raw';
import inputApiScraperExpected from '../../__fixtures__/lib/schema-to-ts/expected/input/api-scraper.ts?raw';
import inputCommentScraperExpected from '../../__fixtures__/lib/schema-to-ts/expected/input/comment-scraper.ts?raw';
import inputFreeAmazonExpected from '../../__fixtures__/lib/schema-to-ts/expected/input/free-amazon-product-scraper.ts?raw';
import inputGooglePlacesExpected from '../../__fixtures__/lib/schema-to-ts/expected/input/google-places.ts?raw';
import inputApiScraper from '../../__fixtures__/lib/schema-to-ts/input/api-scraper.json' with { type: 'json' };
import inputCommentScraper from '../../__fixtures__/lib/schema-to-ts/input/comment-scraper.json' with { type: 'json' };
import inputFreeAmazon from '../../__fixtures__/lib/schema-to-ts/input/free-amazon-product-scraper.json' with { type: 'json' };
import inputGooglePlaces from '../../__fixtures__/lib/schema-to-ts/input/google-places.json' with { type: 'json' };
import kvStoreMapsToPolygon from '../../__fixtures__/lib/schema-to-ts/kvstore/maps-to-polygon.json' with { type: 'json' };

/**
 * Published schemas, compiled through the public facade. The unit tests own the edge cases;
 * these own the claim that the whole pipeline survives schemas nobody wrote for us — every
 * fixture here is a real Actor's schema, keywords, HTML descriptions and all.
 */

/** What a CLI would ask for: the Actor's view of its input, and the caller's. */
const INPUT: CompileOptions = {
	types: [
		{ name: 'Input', variant: 'received' },
		{ name: 'InputArgs', variant: 'supplied' },
	],
};

const datasetTypes = (name: string): CompileOptions => ({
	types: [
		{ name, variant: 'received' },
		{ name: `${name}Draft`, variant: 'supplied' },
	],
});

/**
 * The expected files are checked in as real `.ts`, so the repo's formatter owns their layout:
 * tabs, unions broken across lines with a leading pipe, single-quoted literals, and none of the
 * parentheses the emitter puts around every intersection. That is the point — a generated file
 * lives in a repo with a formatter — so compare only what a formatter cannot touch. The exact
 * bytes the emitter writes are emit.test.ts's business.
 */
function significant(source: string): string {
	return source
		.replace(/^\/\/ oxlint-disable\n/, '')
		.replace(/'([^']*)'/g, '"$1"')
		.replace(/[()]/g, '')
		.replace(/\s+/g, ' ')
		.replace(/ ?([{}<>|;:,&?=]) ?/g, '$1')
		.replace(/([:=<])\|/g, '$1')
		.trim();
}

/** A property no fixture declares, so every case has a type-relevant edit available. */
function withExtraProperty(schema: unknown): unknown {
	const root = schema as { properties: Record<string, unknown> };
	return { ...root, properties: { ...root.properties, addedLater: { type: 'string' } } };
}

/** Diagnostics and notices counted by code, so a case can state the fidelity it knows it loses. */
function tally(items: { code: string }[]): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const { code } of items) counts[code] = (counts[code] ?? 0) + 1;
	return counts;
}

const CASES = [
	{
		label: 'input/api-scraper',
		schema: normalizeInputSchema(inputApiScraper),
		expected: inputApiScraperExpected,
		opts: INPUT,
	},
	{
		label: 'input/comment-scraper',
		schema: normalizeInputSchema(inputCommentScraper),
		expected: inputCommentScraperExpected,
		opts: INPUT,
	},
	{
		label: 'input/free-amazon-product-scraper',
		schema: normalizeInputSchema(inputFreeAmazon),
		expected: inputFreeAmazonExpected,
		opts: INPUT,
	},
	{
		label: 'input/google-places',
		schema: normalizeInputSchema(inputGooglePlaces),
		expected: inputGooglePlacesExpected,
		opts: INPUT,
	},
	{
		label: 'dataset/comment-scraper',
		schema: normalizeDatasetSchema(datasetCommentScraper),
		expected: datasetCommentScraperExpected,
		opts: datasetTypes('Comment'),
	},
	{
		label: 'dataset/google-places',
		schema: normalizeDatasetSchema(datasetGooglePlaces),
		expected: datasetGooglePlacesExpected,
		opts: datasetTypes('Place'),
		// The only fixture here that uses $ref. Every one of those 23 places is a named
		// definition the schema spells out and we hand back as `unknown` — this is the gap,
		// pinned so it cannot widen quietly and so closing it shows up as a diff.
		diagnostics: { 'unsupported-keyword': 23 },
		notices: { 'empty-schema': 5 },
	},
	{
		label: 'dataset/tiktok-followers-scraper',
		schema: normalizeDatasetSchema(datasetTiktokFollowers),
		expected: datasetTiktokFollowersExpected,
		opts: datasetTypes('Connection'),
	},
];

describe.each(CASES)('$label', ({ schema, expected, opts, diagnostics: lost, notices: lint }) => {
	test('compiles to the checked-in TypeScript', () => {
		expect(significant(compile(schema, opts).source)).toBe(significant(expected));
	});

	test('and that comparison has teeth — a schema that moved does not pass it', () => {
		expect(significant(compile(withExtraProperty(schema), opts).source)).not.toBe(significant(expected));
	});

	test('loses exactly the fidelity it admits to, and no more', () => {
		const { diagnostics, notices } = compile(schema, opts);
		expect(tally(diagnostics)).toEqual(lost ?? {});
		expect(tally(notices)).toEqual(lint ?? {});
	});

	test('check reads the formatted file as current — the fingerprint outlives the formatter', () => {
		expect(check(expected, schema, opts)).toMatchObject({ stale: false, reason: 'match' });
	});

	test('check still sees a schema that gained a property', () => {
		expect(check(expected, withExtraProperty(schema), opts)).toMatchObject({
			stale: true,
			reason: 'hash-mismatch',
		});
	});
});

describe('what the published schemas exercise', () => {
	const source = (schema: unknown, opts = INPUT) => compile(schema, opts).source;

	test('an enum becomes a literal union', () => {
		expect(source(normalizeInputSchema(inputApiScraper))).toContain(
			`resultsType: "posts" | "comments" | "details" | "mentions" | "reels" | "stories";`,
		);
	});

	test('a default is present for the Actor and optional for the caller', () => {
		const text = source(normalizeInputSchema(inputApiScraper));
		expect(text).toContain('addParentData: boolean;');
		expect(text).toContain('addParentData?: boolean | undefined;');
	});

	test('an array with no items declaration is Array<unknown>, not Array<any>', () => {
		expect(source(normalizeInputSchema(inputFreeAmazon))).toContain('categoryUrls: Array<unknown>;');
	});

	test('nullable widens the type; nullable: false is a no-op', () => {
		const text = source(normalizeInputSchema(inputFreeAmazon));
		expect(text).toContain('scrapeProductDetails: boolean | null;');
		expect(text).toContain('maxItemsPerStartUrl?: number | undefined;');
	});

	test('dataset fields are optional and nullable, since a run may not fill them', () => {
		expect(source(normalizeDatasetSchema(datasetCommentScraper), datasetTypes('Comment'))).toContain(
			'postUrl?: string | null | undefined;',
		);
	});

	test('an array of untyped objects is Array<Record<string, unknown>>', () => {
		expect(source(normalizeDatasetSchema(datasetCommentScraper), datasetTypes('Comment'))).toContain(
			'replies?: Array<Record<string, unknown>> | null | undefined;',
		);
	});

	test('a nullable nested object keeps its shape inside the union', () => {
		const text = source(normalizeDatasetSchema(datasetTiktokFollowers), datasetTypes('Connection'));
		expect(text).toContain('commerceUser?: boolean | null | undefined;');
		expect(text).toContain('} | null | undefined;');
	});
});

describe('kvstore/maps-to-polygon', () => {
	const meme = kvStoreMapsToPolygon.collections.meme.jsonSchema;

	test('a collection schema needs no preprocessing — it is plain JSON Schema already', () => {
		const { source, diagnostics, notices } = compile(meme, { types: [{ name: 'Meme', variant: 'received' }] });
		expect(diagnostics).toEqual([]);
		expect(notices).toEqual([]);
		expect(source).toContain(['export type Meme = {', '    url: string;', '    topLeft: {'].join('\n'));
	});

	test('additionalProperties: false closes the object for the writer too', () => {
		const { source } = compile(meme, { types: [{ name: 'Meme', variant: 'supplied' }] });
		// The root refused extras, so it stays closed even in the permissive variant. The
		// nested objects never said so, and they do open up.
		expect(source).toContain('export type Meme = {');
		expect(source).toContain('topLeft: ({');
		expect(source).toContain('    } & Record<string, unknown>);');
	});

	test('the same collection round-trips through check', () => {
		const opts: CompileOptions = { types: [{ name: 'Meme', variant: 'received' }] };
		expect(check(compile(meme, opts).source, meme, opts)).toMatchObject({ stale: false, reason: 'match' });
	});
});
