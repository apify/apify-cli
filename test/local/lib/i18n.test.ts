import type { ArgsOfDescriptor, ExtractArgs, MessageDescriptor } from '../../../src/lib/i18n/index.js';
import { defineMessages, getLocale, setLocale, SUPPORTED_LOCALES, t } from '../../../src/lib/i18n/index.js';

describe('i18n', () => {
	afterEach(() => {
		setLocale('en');
	});

	describe('defineMessages()', () => {
		it('returns a descriptor for every id in the default locale', () => {
			const messages = defineMessages({
				en: {
					hello: 'Hello',
					bye: 'Goodbye',
				},
			});

			expect(Object.keys(messages).sort()).toEqual(['bye', 'hello']);
			expect(messages.hello.id).toBe('hello');
			expect(messages.hello.source).toBe('Hello');
			expect(messages.hello.translations).toEqual({ en: 'Hello' });
		});

		it('collects every locale translation per id', () => {
			const messages = defineMessages({
				en: { hello: 'Hello' },
				// @ts-expect-error -- Test only case
				de: { hello: 'Hallo' },
				// @ts-expect-error -- Test only case
				cs: { hello: 'Ahoj' },
			});

			expect(messages.hello.translations).toEqual({
				en: 'Hello',
				de: 'Hallo',
				cs: 'Ahoj',
			});
		});

		it('skips locales that do not translate a given id', () => {
			const messages = defineMessages({
				en: { hello: 'Hello', bye: 'Goodbye' },
				// @ts-expect-error -- Test only case
				de: { hello: 'Hallo' },
			});

			expect(messages.hello.translations).toEqual({ en: 'Hello', de: 'Hallo' });
			expect(messages.bye.translations).toEqual({ en: 'Goodbye' });
		});
	});

	describe('t()', () => {
		it('formats a message with no placeholders', () => {
			const messages = defineMessages({
				en: {
					noActorName: 'You need to provide an actor name',
				},
			});

			expect(t(messages.noActorName)).toBe('You need to provide an actor name');
		});

		it('interpolates a plain {var} placeholder', () => {
			const messages = defineMessages({
				en: {
					actorWithNameExists: 'An actor with the name {name} already exists',
				},
			});

			expect(t(messages.actorWithNameExists, { name: 'my-actor' })).toBe(
				'An actor with the name my-actor already exists',
			);
		});

		it('accepts the {var,string} convenience syntax', () => {
			const messages = defineMessages({
				en: {
					actorWithNameExists: 'An actor with the name {name,string} already exists',
				},
			});

			expect(t(messages.actorWithNameExists, { name: 'John Doe' })).toBe(
				'An actor with the name John Doe already exists',
			);
		});

		it('accepts {var , string} with whitespace around the type', () => {
			const messages = defineMessages({
				en: {
					actorWithNameExists: 'An actor with the name { name , string } already exists',
				},
			});

			expect(t(messages.actorWithNameExists, { name: 'My Actor' })).toBe(
				'An actor with the name My Actor already exists',
			);
		});

		it('formats {var,number} with the locale number formatter', () => {
			const messages = defineMessages({
				en: {
					small: 'There are {count,number} actors',
					big: 'You reached {count,number} runs',
				},
			});

			expect(t(messages.small, { count: 42 })).toBe('There are 42 actors');
			expect(t(messages.big, { count: 1234 })).toBe('You reached 1,234 runs');
		});

		it('formats {var,date,::skeleton} via intl-messageformat', () => {
			const messages = defineMessages({
				en: {
					actorDateTime: 'Wow its {currentTime,date,::yyyy-MM-dd}',
				},
			});

			const result = t(messages.actorDateTime, {
				currentTime: new Date(Date.UTC(2024, 0, 15, 12)),
			});

			// Exact output depends on the Intl runtime; assert the placeholder was
			// consumed and the surrounding text preserved.
			expect(result.startsWith('Wow its ')).toBe(true);
			expect(result).not.toContain('{');
			expect(result).not.toContain('currentTime');
		});

		it('formats {var,time,::skeleton} via intl-messageformat', () => {
			const messages = defineMessages({
				en: {
					actorTime: 'Current time: {now,time,::HH:mm:ss}',
				},
			});

			const result = t(messages.actorTime, {
				now: new Date(2024, 0, 15, 9, 5, 3),
			});

			expect(result).toBe('Current time: 09:05:03');
		});

		it('resolves {var,plural,...} categories', () => {
			const messages = defineMessages({
				en: {
					itemCount: 'You have {count, plural, one {# item} other {# items}}',
				},
			});

			expect(t(messages.itemCount, { count: 1 })).toBe('You have 1 item');
			expect(t(messages.itemCount, { count: 4 })).toBe('You have 4 items');
		});

		it('resolves {var,select,...} branches', () => {
			const messages = defineMessages({
				en: {
					greeting: '{gender, select, male {He} female {She} other {They}} said hi',
				},
			});

			expect(t(messages.greeting, { gender: 'male' })).toBe('He said hi');
			expect(t(messages.greeting, { gender: 'female' })).toBe('She said hi');
			expect(t(messages.greeting, { gender: 'unknown' })).toBe('They said hi');
		});

		it('supports multiple placeholders in a single message', () => {
			const messages = defineMessages({
				en: {
					multiParam: 'Actor {name} has {count,number} runs',
				},
			});

			expect(t(messages.multiParam, { name: 'scraper', count: 100 })).toBe('Actor scraper has 100 runs');
		});

		it('throws when a required placeholder is missing (formatjs behaviour)', () => {
			const messages = defineMessages({
				en: {
					actorWithNameExists: 'An actor with the name {name} already exists',
				},
			});

			// Cast through unknown to bypass the static check — we want to verify
			// the runtime error path from intl-messageformat.
			expect(() => t(messages.actorWithNameExists, {} as unknown as { name: string })).toThrow(/name/);
		});

		it('returns the same output for repeated calls (formatter cache)', () => {
			const messages = defineMessages({
				en: {
					hello: 'Hello {name}',
				},
			});

			expect(t(messages.hello, { name: 'A' })).toBe('Hello A');
			expect(t(messages.hello, { name: 'B' })).toBe('Hello B');
		});
	});

	describe('locale management', () => {
		it('exposes getLocale / setLocale', () => {
			expect(getLocale()).toBe('en');
			// @ts-expect-error -- Test only case
			setLocale('de');
			expect(getLocale()).toBe('de');
		});

		it('uses the active locale translation when present', () => {
			const messages = defineMessages({
				en: { hello: 'Hello {name}' },
				// @ts-expect-error -- Test only case
				de: { hello: 'Hallo {name}' },
			});

			// @ts-expect-error -- Test only case
			setLocale('de');
			expect(t(messages.hello, { name: 'Welt' })).toBe('Hallo Welt');
		});

		it('falls back to the en source when the active locale has no translation', () => {
			const messages = defineMessages({
				en: { hello: 'Hello {name}' },
			});

			// @ts-expect-error -- Test only case
			setLocale('de');
			expect(t(messages.hello, { name: 'Welt' })).toBe('Hello Welt');
		});
	});

	describe('supported locales', () => {
		it('exposes SUPPORTED_LOCALES with en included', () => {
			expect(SUPPORTED_LOCALES).toContain('en');
		});

		it('accepts any SUPPORTED_LOCALES entry as an optional key', () => {
			const messages = defineMessages({
				en: { hello: 'Hello' },
				// @ts-expect-error -- Test only case
				cs: { hello: 'Ahoj' },
				// @ts-expect-error -- Test only case
				fr: { hello: 'Bonjour' },
			});

			expect(messages.hello.translations).toEqual({ en: 'Hello', cs: 'Ahoj', fr: 'Bonjour' });
		});

		it('rejects non-en-only inputs and unknown locale keys at compile time', () => {
			const _assertions = () => {
				// @ts-expect-error -- the `en` locale is required
				defineMessages({});

				defineMessages({
					en: { hello: 'Hello' },
					// @ts-expect-error -- 'xx' is not a supported locale
					xx: { hello: 'Xx' },
				});

				// @ts-expect-error -- setLocale only accepts a SupportedLocale
				setLocale('xx');
			};

			expect(typeof _assertions).toBe('function');
		});
	});

	describe('ICU escape syntax', () => {
		it('treats single-quoted braces as literal text', () => {
			const messages = defineMessages({
				en: {
					jsonHint: "Send JSON like '{'key: value'}'",
				},
			});

			expect(t(messages.jsonHint)).toBe('Send JSON like {key: value}');
		});

		it('combines escaped literal braces with real placeholders', () => {
			const messages = defineMessages({
				en: {
					bothBraces: "Open '{' and insert {value}",
				},
			});

			expect(t(messages.bothBraces, { value: 'x' })).toBe('Open { and insert x');
		});

		it('ignores escaped braces in ExtractArgs', () => {
			expectTypeOf<ExtractArgs<"Escape: '{'literal'}'">>().toEqualTypeOf<Record<never, never>>();
			expectTypeOf<ExtractArgs<"Mixed '{' and {name}">>().toEqualTypeOf<{ name: string }>();
		});
	});

	describe('type inference (compile-time)', () => {
		const messages = defineMessages({
			en: {
				noArgs: 'hi',
				oneString: 'An actor with the name {name,string} already exists',
				plainString: 'Hello {name}!',
				oneNumber: 'You have {count,number} items',
				oneDate: 'Wow its {currentTime,date,::yyyy-MM-dd}',
				withPlural: 'You have {count, plural, one {# item} other {# items}}',
				withSelect: '{gender, select, male {He} female {She} other {They}} said hi',
				multiple: '{name} pushed {count,number} commits',
			},
		});

		it('extracts required argument shapes from ICU sources', () => {
			expectTypeOf<ArgsOfDescriptor<typeof messages.noArgs>>().toEqualTypeOf<Record<never, never>>();
			expectTypeOf<ArgsOfDescriptor<typeof messages.oneString>>().toEqualTypeOf<{ name: string }>();
			expectTypeOf<ArgsOfDescriptor<typeof messages.plainString>>().toEqualTypeOf<{ name: string }>();
			expectTypeOf<ArgsOfDescriptor<typeof messages.oneNumber>>().toEqualTypeOf<{ count: number }>();
			expectTypeOf<ArgsOfDescriptor<typeof messages.oneDate>>().toEqualTypeOf<{ currentTime: Date }>();
			expectTypeOf<ArgsOfDescriptor<typeof messages.withPlural>>().toEqualTypeOf<{ count: number }>();
			expectTypeOf<ArgsOfDescriptor<typeof messages.withSelect>>().toEqualTypeOf<{ gender: string }>();
			expectTypeOf<ArgsOfDescriptor<typeof messages.multiple>>().toEqualTypeOf<{
				name: string;
				count: number;
			}>();
		});

		it('accepts well-typed t() call shapes', () => {
			expect(t(messages.noArgs)).toBe('hi');
			expect(t(messages.oneString, { name: 'a' })).toContain('a');
			expect(t(messages.plainString, { name: 'a' })).toBe('Hello a!');
			expect(t(messages.oneNumber, { count: 1 })).toBe('You have 1 items');
			expect(t(messages.multiple, { name: 'a', count: 1 })).toBe('a pushed 1 commits');
		});

		it('rejects mismatched t() call shapes at compile time', () => {
			// The body is a function whose statements are type-checked but never
			// executed. Each `@ts-expect-error` asserts a specific compile-time
			// rejection; if any stops being an error, tsc will fail the build.
			const _assertions = () => {
				// @ts-expect-error -- noArgs takes no values
				t(messages.noArgs, { name: 'a' });
				// @ts-expect-error -- oneString requires a values object
				t(messages.oneString);
				// @ts-expect-error -- name must be a string
				t(messages.oneString, { name: 1 });
				// @ts-expect-error -- count must be a number
				t(messages.oneNumber, { count: 'nope' });
				// @ts-expect-error -- currentTime must be a Date
				t(messages.oneDate, { currentTime: 'nope' });
			};

			// Reference it so `noUnusedLocals` is happy.
			expect(typeof _assertions).toBe('function');
		});

		it('ExtractArgs handles raw message literals', () => {
			expectTypeOf<ExtractArgs<'plain text'>>().toEqualTypeOf<Record<never, never>>();
			expectTypeOf<ExtractArgs<'hi {name}'>>().toEqualTypeOf<{ name: string }>();
			expectTypeOf<ExtractArgs<'hi {name}, you have {count,number}'>>().toEqualTypeOf<{
				name: string;
				count: number;
			}>();
			expectTypeOf<ExtractArgs<'{count, plural, one {# item} other {# items}} for {user}'>>().toEqualTypeOf<{
				count: number;
				user: string;
			}>();
		});

		it('MessageDescriptor carries the source literal in its generic argument', () => {
			expectTypeOf(messages.plainString).toExtend<MessageDescriptor<'Hello {name}!'>>();
		});
	});
});
