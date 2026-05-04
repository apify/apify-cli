import chalk, { Chalk } from 'chalk';
import { isPlainObject } from 'es-toolkit';
import { IntlMessageFormat } from 'intl-messageformat';

import { markdownToAnsi } from './markdown.js';
import { md } from './md.js';
import type {
	ArgsOfDescriptor,
	Colors,
	HasRequiredArgs,
	MarkdownVariant,
	MessageDescriptor,
	MessageVariants,
	SupportedLocale,
	TFormat,
} from './types.js';
import { DEFAULT_LOCALE } from './types.js';

let currentLocale: SupportedLocale = DEFAULT_LOCALE;

export function setLocale(locale: SupportedLocale): void {
	currentLocale = locale;
}

export function getLocale(): SupportedLocale {
	return currentLocale;
}

/**
 * Level-0 chalk passes its input through unchanged, used for `format:
 * 'markdown'` so inline color helpers in the function-form variant don't
 * leak ANSI escape codes into the rendered markdown.
 */
const colorlessChalk = new Chalk({ level: 0 });

/**
 * Rewrite our convenience `{name,string}` syntax to plain `{name}` —
 * `intl-messageformat` rejects `string` as an unknown argument type.
 */
const STRING_TYPE_RE = /\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*string\s*\}/g;

function preprocessIcuSource(source: string): string {
	return source.replace(STRING_TYPE_RE, '{$1}');
}

export interface TOptions {
	/**
	 * Output format for the rendered message. Defaults to `'terminal'`.
	 *
	 * - `'terminal'` — render the markdown variant, ICU-substitute, then
	 *   convert markdown emphasis to ANSI escape codes.
	 * - `'markdown'` — render the markdown variant and ICU-substitute, but
	 *   leave the markdown syntax intact.
	 * - `'json'` — call the variant's `json` function with `props.jsonParams`
	 *   spread into it, then `JSON.stringify` the result.
	 */
	format?: TFormat;
	/**
	 * Override the active locale for this single call. Defaults to whatever
	 * was last passed to {@link setLocale}.
	 */
	locale?: SupportedLocale;
}

const formatterCache = new Map<string, IntlMessageFormat>();

function getFormatter(locale: SupportedLocale, source: string): IntlMessageFormat {
	// `\u001F` (unit separator) keeps the locale prefix and source unambiguous
	// even if a source happens to start with another locale code.
	const key = `${locale}\u001F${source}`;
	let formatter = formatterCache.get(key);
	if (!formatter) {
		formatter = new IntlMessageFormat(preprocessIcuSource(source), locale, undefined, {
			shouldParseSkeletons: true,
		});
		formatterCache.set(key, formatter);
	}
	return formatter;
}

function resolveVariants(message: MessageDescriptor, locale: SupportedLocale): MessageVariants {
	return message.translations[locale] ?? message.source;
}

function resolveMarkdownSource(markdown: MarkdownVariant, colors: Colors): string {
	return typeof markdown === 'string' ? markdown : markdown(md, colors);
}

/**
 * Tell `props` apart from `options` at runtime. The two collapse into the
 * same arg slot for messages with no required props, so we identify the
 * options bag structurally — `format` and `locale` are reserved key names
 * for that reason; an ICU placeholder named either would confuse this
 * heuristic.
 */
function looksLikeOptions(value: unknown): value is TOptions {
	if (!isPlainObject(value)) {
		return false;
	}
	for (const key of Object.keys(value as Record<string, unknown>)) {
		if (key !== 'format' && key !== 'locale') {
			return false;
		}
	}
	return true;
}

type TArgs<P> = HasRequiredArgs<P> extends true ? [props: P, options?: TOptions] : [options?: TOptions];

/**
 * Format a message in the requested {@link TFormat}. The props argument
 * combines two sources:
 *
 *   - ICU placeholder values, inferred from the markdown source literal
 *     (`markdown: 'hi {actorName}'` → `{ actorName: string }`).
 *   - The json variant's parameter tuple, exposed under a `jsonParams` key
 *     when the json function takes any arguments.
 */
export function t<M extends MessageDescriptor>(message: M, ...args: TArgs<ArgsOfDescriptor<M>>): string {
	let props: Record<string, unknown> | undefined;
	let options: TOptions | undefined;
	if (args.length >= 2) {
		props = args[0] as Record<string, unknown> | undefined;
		options = args[1] as TOptions | undefined;
	} else if (args.length === 1) {
		if (looksLikeOptions(args[0])) {
			options = args[0] as TOptions;
		} else {
			props = args[0] as Record<string, unknown> | undefined;
		}
	}

	const format: TFormat = options?.format ?? 'terminal';
	const locale = options?.locale ?? currentLocale;

	const variants = resolveVariants(message, locale);

	if (format === 'json') {
		const jsonParams = (props?.jsonParams as readonly unknown[] | undefined) ?? [];
		return JSON.stringify(variants.json(...jsonParams)) ?? '';
	}

	// {@link Colors} is identity-typed at compile time; the runtime cast
	// hands the real chalk instance over so ANSI codes still actually emit.
	const colors = (format === 'terminal' ? chalk : colorlessChalk) as unknown as Colors;
	const template = resolveMarkdownSource(variants.markdown, colors);

	const icuValues = props && 'jsonParams' in props ? omitJsonParams(props) : props;

	const formatter = getFormatter(locale, template);
	const substituted = formatter.format(icuValues as never);
	const text = typeof substituted === 'string' ? substituted : String(substituted);

	if (format === 'markdown') {
		return text;
	}

	return markdownToAnsi(text);
}

/** Drop `jsonParams` so it can't collide with a real ICU placeholder. */
function omitJsonParams(props: Record<string, unknown>): Record<string, unknown> {
	const { jsonParams: _jsonParams, ...rest } = props;
	return rest;
}
