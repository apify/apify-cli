/**
 * Locales the CLI ships translations for. `en` is the source of truth and
 * always required; every other entry is optional.
 *
 * Extend this list when you start translating a new locale — the rest of the
 * i18n surface (`defineMessages`, `setLocale`, the `translations` record) will
 * accept the new code automatically.
 */
export const SUPPORTED_LOCALES = ['en'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/**
 * The locale used to source the compile-time type of a message. Keeping this
 * in a single place makes it trivial to swap the reference locale later.
 */
export const DEFAULT_LOCALE = 'en' satisfies SupportedLocale;

export type DefaultLocale = typeof DEFAULT_LOCALE;

/**
 * Descriptor object returned for every message id in {@link defineMessages}.
 *
 * The `source` string is kept as a literal type so that {@link ExtractArgs}
 * can recover the required call-site argument shape.
 */
export interface MessageDescriptor<Source extends string = string> {
	readonly id: string;
	readonly source: Source;
	readonly translations: Readonly<Partial<Record<SupportedLocale, string>>>;
}

type Whitespace = ' ' | '\t' | '\n' | '\r';

type TrimLeft<S extends string> = S extends `${Whitespace}${infer R}` ? TrimLeft<R> : S;
type TrimRight<S extends string> = S extends `${infer R}${Whitespace}` ? TrimRight<R> : S;

type Trim<S extends string> = TrimLeft<TrimRight<S>>;

/**
 * ICU uses a single apostrophe to escape syntax characters: `'{'` → literal
 * `{`, `'}'` → literal `}`, `''` → literal `'`. A lone apostrophe that is not
 * followed by a syntax character is kept as a literal.
 *
 * Stripping these regions before running the placeholder extractor means that
 * escaped braces in a source string do not get mistaken for real placeholders
 * at compile time.
 */
type IcuSyntaxChar = '{' | '}' | '#' | '|';

type StripQuoted<S extends string, Acc extends string = ''> = S extends `${infer Head}'${infer Rest}`
	? Rest extends `${infer Ch}${infer After}`
		? Ch extends IcuSyntaxChar
			? After extends `${string}'${infer Tail}`
				? StripQuoted<Tail, `${Acc}${Head}`>
				: `${Acc}${Head}`
			: Ch extends "'"
				? StripQuoted<After, `${Acc}${Head}'`>
				: StripQuoted<Rest, `${Acc}${Head}'`>
		: `${Acc}${Head}'`
	: `${Acc}${S}`;

/**
 * Consume characters from `S` (which starts *inside* an already-opened `{`)
 * until we close that brace, correctly handling nested pairs. Returns the
 * suffix following the matching close brace, or `''` on EOF.
 */
type SkipToClose<S extends string, Depth extends readonly unknown[] = []> = S extends `${infer Ch}${infer Rest}`
	? Ch extends '{'
		? SkipToClose<Rest, [...Depth, 0]>
		: Ch extends '}'
			? Depth extends readonly [unknown, ...infer RestDepth]
				? SkipToClose<Rest, RestDepth>
				: Rest
			: SkipToClose<Rest, Depth>
	: '';

type SimplePlaceholder<S extends string> = S extends `${infer Name}}${infer Rest}`
	? [Trim<Name>, 'argument', Rest]
	: never;

type TypedPlaceholder<Name extends string, Rest extends string> = Rest extends `${infer Type},${infer Tail}`
	? Type extends `${string}}${string}`
		? Rest extends `${infer Short}}${infer After}`
			? [Trim<Name>, Trim<Short>, After]
			: never
		: [Trim<Name>, Trim<Type>, SkipToClose<Tail>]
	: Rest extends `${infer Type}}${infer After}`
		? [Trim<Name>, Trim<Type>, After]
		: never;

type ParsePlaceholder<S extends string> = S extends `${infer Name},${infer Rest}`
	? Name extends `${string}}${string}`
		? SimplePlaceholder<S>
		: TypedPlaceholder<Name, Rest>
	: SimplePlaceholder<S>;

/**
 * Map an ICU argument type to the TypeScript type we require at the call site.
 *
 * `string` is a convenience extension — plain ICU only spells this as `{var}` —
 * and is stripped at runtime before handing the source to `intl-messageformat`.
 */
export type MapIcuType<Type extends string> = Type extends 'string' | 'argument'
	? string
	: Type extends 'number' | 'plural' | 'selectordinal'
		? number
		: Type extends 'date' | 'time'
			? Date
			: Type extends 'select'
				? string
				: string;

type ExtractArgsRaw<Message extends string, Acc> = Message extends `${string}{${infer After}`
	? ParsePlaceholder<After> extends readonly [infer Name, infer Type, infer Rest]
		? Name extends string
			? Type extends string
				? Rest extends string
					? ExtractArgsRaw<Rest, Acc & { [K in Name]: MapIcuType<Type> }>
					: Acc & { [K in Name]: MapIcuType<Type> }
				: Acc
			: Acc
		: Acc
	: Acc;

/**
 * Walk the message and collect a single object type keyed by each placeholder
 * name. ICU-quoted regions (e.g. `'{'`) are stripped first so that escaped
 * braces are not mistaken for placeholders. Result is flattened so it compares
 * identical to a hand-written object type under `toEqualTypeOf`.
 */
export type ExtractArgs<Message extends string> = Simplify<ExtractArgsRaw<StripQuoted<Message>, EmptyArgs>>;

export type EmptyArgs = Record<never, never>;

export type Simplify<T> = { [K in keyof T]: T[K] } & {};

export type HasRequiredArgs<T> = [keyof T] extends [never] ? false : true;

export type ArgsOfDescriptor<M> = M extends MessageDescriptor<infer S> ? ExtractArgs<S> : never;

type OptionalSupportedLocaleMessages = {
	readonly [K in Exclude<SupportedLocale, DefaultLocale>]?: Readonly<Record<string, string>>;
};

export interface DefineMessagesInput extends OptionalSupportedLocaleMessages {
	readonly en: Readonly<Record<string, string>>;
}

export type DefineMessagesResult<T extends DefineMessagesInput> = {
	readonly [K in keyof T[DefaultLocale] & string]: MessageDescriptor<
		T[DefaultLocale][K] extends string ? T[DefaultLocale][K] : string
	>;
};
