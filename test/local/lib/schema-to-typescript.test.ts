import { compileSchema } from '../../../src/lib/schema-to-typescript.js';

describe('compileSchema', () => {
	it('should emit an interface with required and optional properties', () => {
		const result = compileSchema(
			{
				type: 'object',
				description: 'Root schema',
				properties: {
					name: { type: 'string', description: 'The name' },
					age: { type: 'integer' },
				},
				required: ['name'],
			},
			'input',
		);

		expect(result).toBe(
			[
				'/**',
				' * Root schema',
				' */',
				'export interface Input {',
				'  /**',
				'   * The name',
				'   */',
				'  name: string;',
				'  age?: number;',
				'}',
				'',
			].join('\n'),
		);
	});

	it('should prepend the banner comment', () => {
		const result = compileSchema({ type: 'object' }, 'input', { bannerComment: '\n/* generated */\n' });

		expect(result).toBe('/* generated */\n\nexport interface Input {}\n');
	});

	it('should pascal-case the declaration name', () => {
		expect(compileSchema({ type: 'object' }, 'my-collection weird_name')).toContain(
			'export interface MyCollectionWeirdName',
		);
		expect(compileSchema({ type: 'object' }, '1st')).toContain('export interface _1st');
	});

	it('should add an index signature only when additionalProperties is enabled', () => {
		const schema = { type: 'object', properties: { a: { type: 'string' } } };

		expect(compileSchema(schema, 'x')).not.toContain('[k: string]');
		expect(compileSchema(schema, 'x', { additionalProperties: true })).toContain('[k: string]: unknown;');
	});

	it('should honour additionalProperties declared in the schema itself', () => {
		expect(compileSchema({ type: 'object', additionalProperties: { type: 'number' } }, 'x')).toContain(
			'[k: string]: number;',
		);

		expect(
			compileSchema({ type: 'object', additionalProperties: false, properties: { a: { type: 'string' } } }, 'x', {
				additionalProperties: true,
			}),
		).not.toContain('[k: string]');

		expect(compileSchema({ type: 'object', patternProperties: { '^S_': { type: 'string' } } }, 'x')).toContain(
			'[k: string]: string;',
		);
	});

	it('should render enums, consts and type unions as literal unions', () => {
		const result = compileSchema(
			{
				type: 'object',
				properties: {
					choice: { type: 'string', enum: ['a', 'b'] },
					fixed: { const: 42 },
					mixed: { type: ['string', 'null'] },
					nothing: { enum: [] },
				},
			},
			'x',
		);

		expect(result).toContain('choice?: "a" | "b";');
		expect(result).toContain('fixed?: 42;');
		expect(result).toContain('mixed?: string | null;');
		expect(result).toContain('nothing?: never;');
	});

	it('should render anyOf/oneOf as unions and allOf as an intersection', () => {
		const result = compileSchema(
			{
				type: 'object',
				properties: {
					a: { anyOf: [{ type: 'string' }, { type: 'number' }] },
					b: { oneOf: [{ type: 'boolean' }, { type: 'null' }] },
					c: { allOf: [{ type: 'object', properties: { x: { type: 'string' } } }, { type: 'object' }] },
				},
			},
			'x',
		);

		expect(result).toContain('a?: string | number;');
		expect(result).toContain('b?: boolean | null;');
		expect(result).toContain('c?: {\n    x?: string;\n  } & {};');
	});

	it('should render arrays, including tuples and unions of items', () => {
		const result = compileSchema(
			{
				type: 'object',
				properties: {
					untyped: { type: 'array' },
					strings: { type: 'array', items: { type: 'string' } },
					unions: { type: 'array', items: { type: ['string', 'number'] } },
					tuple: { type: 'array', items: [{ type: 'string' }, { type: 'number' }] },
				},
			},
			'x',
		);

		expect(result).toContain('untyped?: unknown[];');
		expect(result).toContain('strings?: string[];');
		expect(result).toContain('unions?: (string | number)[];');
		expect(result).toContain('tuple?: [string, number];');
	});

	it('should quote property names that are not valid identifiers', () => {
		expect(compileSchema({ type: 'object', properties: { 'weird-key': { type: 'string' } } }, 'x')).toContain(
			'"weird-key"?: string;',
		);
	});

	it('should inline local $refs and collapse recursive ones', () => {
		const result = compileSchema(
			{
				type: 'object',
				definitions: {
					node: { type: 'object', properties: { child: { $ref: '#/definitions/node' } } },
				},
				properties: { root: { $ref: '#/definitions/node' } },
			},
			'x',
		);

		expect(result).toContain('root?: {\n    child?: unknown;\n  };');
	});

	it('should resolve $refs that point through arrays', () => {
		const result = compileSchema(
			{
				type: 'object',
				definitions: { x: { anyOf: [{ type: 'string' }, { type: 'number' }] } },
				properties: { a: { $ref: '#/definitions/x/anyOf/0' } },
			},
			'x',
		);

		expect(result).toContain('a?: string;');
	});

	it('should not resolve $refs against Object.prototype', () => {
		expect(() => compileSchema({ definitions: {}, $ref: '#/definitions/hasOwnProperty' }, 'x')).toThrow(
			'Cannot resolve $ref',
		);
	});

	it('should throw on external and unresolvable $refs', () => {
		expect(() => compileSchema({ $ref: './other.json' }, 'x')).toThrow('only local references');
		expect(() => compileSchema({ $ref: '#/definitions/missing' }, 'x')).toThrow('Cannot resolve $ref');
		expect(() => compileSchema({ $ref: '#/%' }, 'x')).toThrow('Cannot resolve $ref');
	});

	it('should emit a type alias when the root is not an object', () => {
		expect(compileSchema({ type: 'array', items: { type: 'string' } }, 'x')).toBe('export type X = string[];\n');
	});

	it('should emit a type alias when the root renders as a union, intersection or array of objects', () => {
		const object = { type: 'object', properties: { a: { type: 'string' } } };

		expect(compileSchema({ ...object, type: ['object', 'null'] }, 'x')).toBe(
			'export type X = {\n  a?: string;\n} | null;\n',
		);
		expect(compileSchema({ allOf: [object, { type: 'object' }] }, 'x')).toBe(
			'export type X = {\n  a?: string;\n} & {};\n',
		);
		expect(compileSchema({ type: 'array', items: object }, 'x')).toBe('export type X = {\n  a?: string;\n}[];\n');
	});

	it('should escape comment terminators in descriptions', () => {
		const result = compileSchema(
			{ type: 'object', properties: { globs: { type: 'string', description: 'e.g. https://x.com/**/*' } } },
			'x',
		);

		expect(result).not.toContain('/**/*');
		expect(result).toContain('e.g. https://x.com/**\\/*');
	});

	it('should intersect sibling object keywords with allOf/anyOf/oneOf instead of dropping them', () => {
		expect(
			compileSchema(
				{
					type: 'object',
					properties: { a: { type: 'string' } },
					allOf: [{ type: 'object', properties: { b: { type: 'number' } } }],
				},
				'x',
			),
		).toBe('export type X = {\n  a?: string;\n} & {\n  b?: number;\n};\n');
	});

	it('should intersect every composition keyword, not just the first', () => {
		expect(
			compileSchema(
				{
					allOf: [{ type: 'object', properties: { a: { type: 'string' } } }],
					anyOf: [{ type: 'object', properties: { b: { type: 'number' } } }],
				},
				'x',
			),
		).toBe('export type X = {\n  a?: string;\n} & {\n  b?: number;\n};\n');
	});

	it('should keep patternProperties when additionalProperties is false', () => {
		expect(
			compileSchema(
				{ type: 'object', patternProperties: { '^S_': { type: 'string' } }, additionalProperties: false },
				'x',
			),
		).toContain('[k: string]: string;');

		expect(compileSchema({ type: 'object', additionalProperties: false }, 'x')).toBe('export interface X {}\n');
	});

	it('should widen the index signature so declared properties stay assignable', () => {
		expect(
			compileSchema(
				{ type: 'object', properties: { a: { type: 'number' } }, patternProperties: { '^s_': { type: 'string' } } },
				'x',
			),
		).toContain('[k: string]: unknown;');

		expect(
			compileSchema(
				{ type: 'object', additionalProperties: true, patternProperties: { '^s_': { type: 'string' } } },
				'x',
			),
		).toContain('[k: string]: unknown;');
	});
});
