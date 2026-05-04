import type { md as mdFunction } from './md.js';

/**
 * Locales the CLI ships translations for. `en` is the source of truth and
 * always required; every other entry is optional.
 *
 * Extend this list when you start translating a new locale — the rest of the
 * i18n surface (`defineMessages`, `setLocale`, the `translations` record) will
 * accept the new code automatically.
 */
export const SUPPORTED_LOCALES = ['en', 'cs', 'de', 'es', 'fr'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/**
 * The locale used to source messages when the active locale has no
 * translation for a given id.
 */
export const DEFAULT_LOCALE = 'en' satisfies SupportedLocale;

export type DefaultLocale = typeof DEFAULT_LOCALE;

export type TFormat = 'terminal' | 'markdown' | 'json';

/**
 * Identity-typed chalk surface handed to the markdown function variant.
 * Every call/method returns its argument as a literal at the type level —
 * the runtime value is real chalk (level-3 for terminal, level-0 for the
 * markdown format), so the identity typing is a deliberate compile-time
 * fiction that lets template literals preserve ICU placeholder names.
 */
type ColorName =
	| 'reset'
	| 'bold'
	| 'dim'
	| 'italic'
	| 'underline'
	| 'strikethrough'
	| 'inverse'
	| 'hidden'
	| 'visible'
	| 'black'
	| 'red'
	| 'green'
	| 'yellow'
	| 'blue'
	| 'magenta'
	| 'cyan'
	| 'white'
	| 'gray'
	| 'grey'
	| 'blackBright'
	| 'redBright'
	| 'greenBright'
	| 'yellowBright'
	| 'blueBright'
	| 'magentaBright'
	| 'cyanBright'
	| 'whiteBright'
	| 'bgBlack'
	| 'bgRed'
	| 'bgGreen'
	| 'bgYellow'
	| 'bgBlue'
	| 'bgMagenta'
	| 'bgCyan'
	| 'bgWhite'
	| 'bgGray'
	| 'bgGrey'
	| 'bgBlackBright'
	| 'bgRedBright'
	| 'bgGreenBright'
	| 'bgYellowBright'
	| 'bgBlueBright'
	| 'bgMagentaBright'
	| 'bgCyanBright'
	| 'bgWhiteBright';

export type Colors = {
	<const T extends string>(text: T): T;
	rgb(red: number, green: number, blue: number): Colors;
	hex(color: string): Colors;
	ansi256(code: number): Colors;
	bgRgb(red: number, green: number, blue: number): Colors;
	bgHex(color: string): Colors;
	bgAnsi256(code: number): Colors;
} & { readonly [K in ColorName]: Colors };

// =============================================================================
// ICU placeholder extraction (compile-time)
// =============================================================================

type Whitespace = ' ' | '\t' | '\n' | '\r';

type TrimLeft<S extends string> = S extends `${Whitespace}${infer R}` ? TrimLeft<R> : S;
type TrimRight<S extends string> = S extends `${infer R}${Whitespace}` ? TrimRight<R> : S;
type Trim<S extends string> = TrimLeft<TrimRight<S>>;

/**
 * ICU uses a single apostrophe to escape syntax characters: `'{'` → literal
 * `{`, `'}'` → literal `}`, `''` → literal `'`. A lone apostrophe that is not
 * followed by a syntax character is kept as a literal. Stripping these
 * regions before placeholder extraction stops escaped braces from being
 * mistaken for placeholders at compile time.
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
 * Map an ICU argument type to the TypeScript type required at the call site.
 * `string` is a convenience extension — plain ICU only spells this as
 * `{var}` — and is stripped at runtime before handing the source to
 * `intl-messageformat`.
 */
export type MapIcuType<Type extends string> = Type extends 'number' | 'plural' | 'selectordinal'
	? number
	: Type extends 'date' | 'time'
		? Date
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
 * name. ICU-quoted regions (e.g. `'{'`) are stripped first.
 */
export type ExtractArgs<Message extends string> = Simplify<ExtractArgsRaw<StripQuoted<Message>, EmptyArgs>>;

export type EmptyArgs = Record<never, never>;

export type Simplify<T> = { [K in keyof T]: T[K] } & {};

// =============================================================================
// Variants and combined props
// =============================================================================

/**
 * The markdown variant can be a literal string (preferred — preserves ICU
 * placeholder names for type inference under `<const T>`) or a function that
 * receives the {@link mdFunction | md} helper and a chalk-shaped color
 * instance and returns a string. Wrap the function-form template in `md` so
 * placeholder inference survives the colored interpolations.
 */
export type MarkdownVariant = string | ((md: typeof mdFunction, colors: Colors) => string);

export interface MessageVariants {
	markdown: MarkdownVariant;
	json: (...args: readonly any[]) => unknown;
}

/**
 * Pull the markdown source literal out of a variants type, when possible.
 * Falls back to `string` when `markdown` is a function whose return type was
 * widened.
 */
export type MarkdownSourceOf<V> = V extends { markdown: infer M extends string }
	? M
	: V extends { markdown: (...args: any[]) => infer R extends string }
		? R
		: string;

export type JsonArgsOf<V> = V extends { json: (...args: infer A) => unknown } ? A : readonly [];

/**
 * Combine markdown ICU placeholders with the json variant's parameter tuple.
 * When `json` is nullary the result is just the placeholders; otherwise the
 * tuple appears under a `jsonParams` key, e.g.
 * `{ name: string; jsonParams: [Actor] }`.
 */
export type CombinedProps<V> =
	JsonArgsOf<V> extends readonly []
		? ExtractArgs<MarkdownSourceOf<V>>
		: Simplify<ExtractArgs<MarkdownSourceOf<V>> & { jsonParams: JsonArgsOf<V> }>;

export type HasRequiredArgs<P> = [keyof P] extends [never] ? false : true;

// =============================================================================
// Descriptor and DefineMessagesInput
// =============================================================================

export interface MessageDescriptor<V extends MessageVariants = MessageVariants> {
	readonly id: string;
	readonly source: V;
	readonly translations: Readonly<Partial<Record<SupportedLocale, V>>>;
}

export type ArgsOfDescriptor<M> = M extends MessageDescriptor<infer V> ? CombinedProps<V> : never;

/**
 * Intersection-based input validator for `defineMessages`.
 *
 * `<const T extends DefineMessagesInput>` would widen the markdown function's
 * return type to `string` (because the constraint mentions `MessageVariants`,
 * which contains a function type), killing ICU placeholder inference. Bare
 * `<const T>` plus parameter intersection keeps literals intact. Two extra
 * subtleties matter:
 *
 *  - The "matched" branches return `unknown` (a no-op in intersection)
 *    rather than re-projecting `T[K]` through a conditional, which would
 *    again pull each value through a structural check and widen.
 *  - `'en'` is enforced via `'en' extends keyof T` (key-presence) rather
 *    than `T extends { en: ... }` (shape match) for the same reason.
 */
export type DefineMessagesInput<T> = {
	readonly [K in Exclude<keyof T, SupportedLocale>]: never;
} & {
	readonly [K in keyof T & SupportedLocale]: T[K] extends Readonly<Record<string, MessageVariants>>
		? unknown
		: Readonly<Record<string, MessageVariants>>;
} & ('en' extends keyof T ? unknown : { readonly en: Readonly<Record<string, MessageVariants>> });

export type DefineMessagesResult<T> = T extends { en: infer E }
	? E extends Readonly<Record<string, MessageVariants>>
		? {
				readonly [K in keyof E & string]: MessageDescriptor<
					E[K] extends MessageVariants ? E[K] : MessageVariants
				>;
			}
		: never
	: never;
