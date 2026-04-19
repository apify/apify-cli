import { IntlMessageFormat } from 'intl-messageformat';

import type { ArgsOfDescriptor, HasRequiredArgs, MessageDescriptor, SupportedLocale } from './types.js';
import { DEFAULT_LOCALE } from './types.js';

let currentLocale: SupportedLocale = DEFAULT_LOCALE;

export function setLocale(locale: SupportedLocale): void {
	currentLocale = locale;
}

export function getLocale(): SupportedLocale {
	return currentLocale;
}

/**
 * Rewrite our convenience `{name,string}` syntax to plain `{name}` before
 * handing the message to `intl-messageformat`, which rejects `string` as an
 * unknown argument type.
 */
const STRING_TYPE_RE = /\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*string\s*\}/g;

function preprocessMessage(message: string): string {
	return message.replace(STRING_TYPE_RE, '{$1}');
}

const formatterCache = new Map<string, IntlMessageFormat>();

function getFormatter(locale: SupportedLocale, source: string): IntlMessageFormat {
	const key = `${locale}\u001F${source}`;
	let formatter = formatterCache.get(key);
	if (!formatter) {
		formatter = new IntlMessageFormat(preprocessMessage(source), locale, undefined, {
			shouldParseSkeletons: true,
		});
		formatterCache.set(key, formatter);
	}
	return formatter;
}

function resolveSource(message: MessageDescriptor<string>, locale: SupportedLocale): string {
	return message.translations[locale] ?? message.translations[DEFAULT_LOCALE] ?? message.source;
}

/**
 * Format a message for the current locale, strictly typed against the
 * placeholders declared in the message source.
 */
export function t<M extends MessageDescriptor<string>>(
	message: M,
	...args: HasRequiredArgs<ArgsOfDescriptor<M>> extends true ? [values: ArgsOfDescriptor<M>] : []
): string {
	const source = resolveSource(message, currentLocale);
	const formatter = getFormatter(currentLocale, source);
	const values = (args as [Record<string, unknown>?])[0];
	const result = formatter.format(values as never);
	return typeof result === 'string' ? result : String(result);
}
