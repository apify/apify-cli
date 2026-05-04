import type {
	DefineMessagesInput,
	DefineMessagesResult,
	MessageDescriptor,
	MessageVariants,
	SupportedLocale,
} from './types.js';
import { DEFAULT_LOCALE } from './types.js';

type LocaleRecord = Partial<Record<SupportedLocale, Readonly<Record<string, MessageVariants>>>>;

/**
 * Declare a set of localized messages.
 *
 * Each message is a {@link MessageVariants} object with a `markdown` source
 * and a `json` builder. The `en` locale is required and acts as the runtime
 * fallback when the active locale has no translation for a given id; every
 * other locale must be a key from {@link SUPPORTED_LOCALES}.
 *
 * Implementation note: the generic is `<const T>` with no `extends` clause —
 * an `extends` constraint that references `MessageVariants` (which contains a
 * function type) would force TypeScript to widen the markdown function's
 * return type, breaking ICU placeholder inference. Validation happens via
 * the {@link DefineMessagesInput} intersection on the parameter instead.
 */
export function defineMessages<const T>(input: T & DefineMessagesInput<T>): DefineMessagesResult<T> {
	const localeRecord = input as unknown as LocaleRecord;
	const base = localeRecord[DEFAULT_LOCALE]!;
	const result: Record<string, MessageDescriptor> = {};

	for (const id of Object.keys(base)) {
		const translations: Partial<Record<SupportedLocale, MessageVariants>> = {};
		for (const locale of Object.keys(localeRecord) as SupportedLocale[]) {
			const variants = localeRecord[locale]?.[id];
			if (variants) {
				translations[locale] = variants;
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
