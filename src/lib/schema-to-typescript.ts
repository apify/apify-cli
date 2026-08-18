type Schema = Record<string, unknown>;

export interface CompileSchemaOptions {
	/** Comment prepended to the generated source. */
	bannerComment?: string;
	/** Whether object types get an `[k: string]: unknown` index signature. */
	additionalProperties?: boolean;
}

/**
 * A rendered type plus the shape information the caller needs:
 * `object` may become an `interface`, `composite` needs parentheses to compose.
 */
interface Rendered {
	text: string;
	kind: 'object' | 'composite' | 'other';
}

const INDENT = '  ';
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** The identifier `compileSchema` declares for `name`. */
export function declarationName(name: string) {
	const pascal = name
		.split(/[^A-Za-z0-9]+/)
		.filter(Boolean)
		.map((part) => part[0].toUpperCase() + part.slice(1))
		.join('');

	return IDENTIFIER.test(pascal) ? pascal : `_${pascal}`;
}

function docComment(description: unknown, indent: string) {
	if (typeof description !== 'string' || description.length === 0) {
		return '';
	}

	// `*/` inside a description would terminate the comment early.
	const lines = description.split('\n').map((line) => `${indent} * ${line.replaceAll('*/', '*\\/')}`.trimEnd());

	return `${indent}/**\n${lines.join('\n')}\n${indent} */\n`;
}

function literal(value: unknown) {
	return value === undefined ? 'undefined' : JSON.stringify(value);
}

const plain = (text: string): Rendered => ({ text, kind: 'other' });
const objectType = (text: string): Rendered => ({ text, kind: 'object' });

/** Wraps unions and intersections so they compose correctly with `[]`, `|` and `&`. */
function wrap(rendered: Rendered) {
	return rendered.kind === 'composite' ? `(${rendered.text})` : rendered.text;
}

function join(parts: Rendered[], separator: ' | ' | ' & '): Rendered {
	return parts.length === 1 ? parts[0] : { text: parts.map(wrap).join(separator), kind: 'composite' };
}

function tryDecodeURIComponent(value: string) {
	try {
		return decodeURIComponent(value);
	} catch {
		return undefined;
	}
}

function isSchemaObject(value: unknown): value is Schema {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasObjectKeywords(node: Schema) {
	return Boolean(node.properties || node.patternProperties) || 'additionalProperties' in node;
}

/**
 * Generates a TypeScript declaration from a JSON schema.
 *
 * Everything is inlined into a single exported declaration named after `name`.
 * Local `$ref`s are resolved against `schema`; external ones throw, since the
 * generator never reads from the network or the file system.
 */
export function compileSchema(schema: Schema, name: string, options: CompileSchemaOptions = {}) {
	const allowAdditionalProperties = options.additionalProperties ?? false;

	function resolveRef(ref: string): unknown {
		if (!ref.startsWith('#')) {
			throw new Error(`Cannot resolve $ref "${ref}": only local references starting with "#" are supported.`);
		}

		let current: unknown = schema;

		for (const segment of ref.slice(1).split('/').filter(Boolean)) {
			// A malformed percent-escape makes decodeURIComponent throw a bare URIError.
			const key = tryDecodeURIComponent(segment)?.replaceAll('~1', '/').replaceAll('~0', '~');
			const container = Array.isArray(current) || isSchemaObject(current) ? current : undefined;

			if (key === undefined || !container || !Object.hasOwn(container, key)) {
				throw new Error(`Cannot resolve $ref "${ref}".`);
			}

			current = (container as Record<string, unknown>)[key];
		}

		return current;
	}

	function renderObject(node: Schema, indent: string, seenRefs: Set<string>) {
		const inner = indent + INDENT;
		const properties = isSchemaObject(node.properties) ? node.properties : {};
		const required = new Set(Array.isArray(node.required) ? node.required.map(String) : []);

		const members = Object.entries(properties).map(([key, property]) => {
			const propertyName = IDENTIFIER.test(key) ? key : JSON.stringify(key);
			const optional = required.has(key) ? '' : '?';
			const description = isSchemaObject(property) ? property.description : undefined;
			const type = renderType(property, inner, seenRefs).text;

			return `${docComment(description, inner)}${inner}${propertyName}${optional}: ${type};`;
		});

		const indexType = renderIndexSignature(node, inner, seenRefs, members.length > 0);

		if (indexType) {
			members.push(`${inner}[k: string]: ${indexType};`);
		}

		return members.length === 0 ? '{}' : `{\n${members.join('\n')}\n${indent}}`;
	}

	function renderIndexSignature(node: Schema, indent: string, seenRefs: Set<string>, hasMembers: boolean) {
		const { additionalProperties, patternProperties } = node;

		let indexType: string | null = null;

		if (isSchemaObject(additionalProperties)) {
			indexType = renderType(additionalProperties, indent, seenRefs).text;
		} else if (additionalProperties === true) {
			indexType = 'unknown';
		} else if (isSchemaObject(patternProperties) && Object.keys(patternProperties).length > 0) {
			// `additionalProperties: false` still permits keys matched by `patternProperties`.
			indexType = Object.values(patternProperties)
				.map((pattern) => wrap(renderType(pattern, indent, seenRefs)))
				.join(' | ');
		} else if (additionalProperties !== false && allowAdditionalProperties) {
			indexType = 'unknown';
		}

		// Optional members are not assignable to a narrower index type, so widen instead.
		return indexType && hasMembers ? 'unknown' : indexType;
	}

	function renderArray(node: Schema, indent: string, seenRefs: Set<string>) {
		const { items } = node;

		if (Array.isArray(items)) {
			return `[${items.map((item) => renderType(item, indent, seenRefs).text).join(', ')}]`;
		}

		return items === undefined ? 'unknown[]' : `${wrap(renderType(items, indent, seenRefs))}[]`;
	}

	function renderNamedType(type: string, node: Schema, indent: string, seenRefs: Set<string>): Rendered {
		switch (type) {
			case 'object':
				return objectType(renderObject(node, indent, seenRefs));
			case 'array':
				return plain(renderArray(node, indent, seenRefs));
			case 'string':
				return plain('string');
			case 'integer':
			case 'number':
				return plain('number');
			case 'boolean':
				return plain('boolean');
			case 'null':
				return plain('null');
			default:
				return plain('unknown');
		}
	}

	function renderType(node: unknown, indent: string, seenRefs: Set<string>): Rendered {
		if (node === false) {
			return plain('never');
		}

		if (!isSchemaObject(node)) {
			return plain('unknown');
		}

		if (typeof node.$ref === 'string') {
			// Recursive $refs collapse to `unknown`, since everything is inlined.
			if (seenRefs.has(node.$ref)) {
				return plain('unknown');
			}

			const nested = new Set(seenRefs).add(node.$ref);

			return renderType(resolveRef(node.$ref), indent, nested);
		}

		if (Array.isArray(node.enum)) {
			return node.enum.length === 0
				? plain('never')
				: join(
						node.enum.map((value) => plain(literal(value))),
						' | ',
					);
		}

		if ('const' in node) {
			return plain(literal(node.const));
		}

		const compositions: Rendered[] = [];

		for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
			const variants = node[keyword];

			if (Array.isArray(variants) && variants.length > 0) {
				compositions.push(
					join(
						variants.map((variant) => renderType(variant, indent, seenRefs)),
						keyword === 'allOf' ? ' & ' : ' | ',
					),
				);
			}
		}

		if (compositions.length > 0) {
			// Sibling object keywords constrain the same value, so they are intersected in rather than dropped.
			const siblings = hasObjectKeywords(node) ? renderObject(node, indent, seenRefs) : '{}';

			if (siblings !== '{}') {
				compositions.unshift(objectType(siblings));
			}

			return join(compositions, ' & ');
		}

		const { type } = node;

		if (Array.isArray(type)) {
			return type.length === 0
				? plain('unknown')
				: join(
						type.map((entry) => renderNamedType(String(entry), node, indent, seenRefs)),
						' | ',
					);
		}

		if (typeof type === 'string') {
			return renderNamedType(type, node, indent, seenRefs);
		}

		if (hasObjectKeywords(node)) {
			return objectType(renderObject(node, indent, seenRefs));
		}

		if (node.items) {
			return plain(renderArray(node, indent, seenRefs));
		}

		return plain('unknown');
	}

	const banner = options.bannerComment?.trim();
	const body = renderType(schema, '', new Set());
	const declaration =
		body.kind === 'object'
			? `export interface ${declarationName(name)} ${body.text}\n`
			: `export type ${declarationName(name)} = ${body.text};\n`;

	return `${banner ? `${banner}\n\n` : ''}${docComment(schema.description, '')}${declaration}`;
}
