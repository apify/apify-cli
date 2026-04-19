import type { DefineMessagesInput, DefineMessagesResult, MessageDescriptor, SupportedLocale } from './types.js';
import { DEFAULT_LOCALE } from './types.js';

/**
 * Force any top-level key on the input that is not in {@link SupportedLocale}
 * to `never`. Generic inference on its own lets unknown keys slip through the
 * `extends` constraint — intersecting with this type pins every extra key to
 * an impossible value so the call fails at the use site.
 */
type RejectUnknownLocales<T> = {
	[K in Exclude<keyof T, SupportedLocale>]: never;
};

/**
 * Declare a set of localized messages.
 *
 * Requires an `en` locale — it is used as the compile-time source for argument
 * type inference and as the runtime fallback when the active locale is missing
 * a translation. Every other locale key must be in {@link SUPPORTED_LOCALES}.
 */
export function defineMessages<const T extends DefineMessagesInput>(
	input: T & RejectUnknownLocales<T>,
): DefineMessagesResult<T> {
	const base = input[DEFAULT_LOCALE];
	const result: Record<string, MessageDescriptor<string>> = {};

	for (const id of Object.keys(base)) {
		const translations: Partial<Record<SupportedLocale, string>> = {};
		for (const locale of Object.keys(input) as SupportedLocale[]) {
			const message = input[locale]?.[id];
			if (typeof message === 'string') {
				translations[locale] = message;
			}
		}

		result[id] = {
			id,
			source: base[id],
			translations,
		};
	}

	return result as DefineMessagesResult<T>;
}
