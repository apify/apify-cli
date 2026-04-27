import chalk from 'chalk';
import stripAnsi from 'strip-ansi';

import type { ArgsOfDescriptor, MessageDescriptor } from '../../../src/lib/i18n/index.js';
import {
	defineMessages,
	getLocale,
	markdownToAnsi,
	setLocale,
	SUPPORTED_LOCALES,
	t,
} from '../../../src/lib/i18n/index.js';
import type { CombinedProps, ExtractArgs, JsonArgsOf, MarkdownSourceOf } from '../../../src/lib/i18n/types.js';

describe('i18n', () => {
	// Vitest workers run without a TTY, so chalk auto-detects no color support
	// and emits plain text. Force a non-zero level for the duration of this
	// suite so the markdown → ANSI assertions can actually inspect emitted
	// SGR codes.
	const originalChalkLevel = chalk.level;
	beforeAll(() => {
		chalk.level = 3;
	});
	afterAll(() => {
		chalk.level = originalChalkLevel;
	});

	afterEach(() => {
		setLocale('en');
	});

	describe('defineMessages()', () => {
		it('returns a descriptor for every id in the default locale', () => {
			const messages = defineMessages({
				en: {
					hello: {
						markdown: 'Hello',
						json: () => null,
					},
					bye: {
						markdown: 'Goodbye',
						json: () => null,
					},
				},
			});

			expect(Object.keys(messages).sort()).toEqual(['bye', 'hello']);
			expect(messages.hello.id).toBe('hello');
			expect(messages.hello.source.markdown).toBe('Hello');
			expect(messages.hello.source.json).toBeTypeOf('function');
			expect(Object.keys(messages.hello.translations)).toEqual(['en']);
		});

		it('collects every locale variant per id', () => {
			const messages = defineMessages({
				en: {
					hello: { markdown: 'Hello', json: () => null },
				},
				de: {
					hello: { markdown: 'Hallo', json: () => null },
				},
				cs: {
					hello: { markdown: 'Ahoj', json: () => null },
				},
			});

			expect(Object.keys(messages.hello.translations).sort()).toEqual(['cs', 'de', 'en']);
		});

		it('skips locales that do not translate a given id', () => {
			const messages = defineMessages({
				en: {
					hello: { markdown: 'Hello', json: () => null },
					bye: { markdown: 'Goodbye', json: () => null },
				},
				de: {
					hello: { markdown: 'Hallo', json: () => null },
				},
			});

			expect(Object.keys(messages.hello.translations).sort()).toEqual(['de', 'en']);
			expect(Object.keys(messages.bye.translations)).toEqual(['en']);
		});
	});

	describe('t() — terminal format (default)', () => {
		it('renders a markdown message and converts emphasis to ANSI', () => {
			const messages = defineMessages({
				en: {
					hello: {
						markdown: 'Welcome **friend**',
						json: () => null,
					},
				},
			});

			const result = t(messages.hello);
			expect(stripAnsi(result)).toBe('Welcome friend');
			expect(result).not.toBe('Welcome **friend**');
			expect(result).toContain('\x1b[');
		});

		it('substitutes ICU placeholders inferred from the markdown literal', () => {
			const messages = defineMessages({
				en: {
					actorWithNameExists: {
						markdown: 'An actor with the name **{name}** already exists',
						json: () => null,
					},
				},
			});

			const result = stripAnsi(t(messages.actorWithNameExists, { name: 'my-actor' }));
			expect(result).toBe('An actor with the name my-actor already exists');
		});

		it('formats {var,number} via the locale formatter', () => {
			const messages = defineMessages({
				en: {
					big: {
						markdown: 'You reached {count,number} runs',
						json: () => null,
					},
				},
			});

			expect(stripAnsi(t(messages.big, { count: 1234 }))).toBe('You reached 1,234 runs');
		});

		it('resolves {var,plural,...} categories', () => {
			const messages = defineMessages({
				en: {
					itemCount: {
						markdown: 'You have {count, plural, one {# item} other {# items}}',
						json: () => null,
					},
				},
			});

			expect(stripAnsi(t(messages.itemCount, { count: 1 }))).toBe('You have 1 item');
			expect(stripAnsi(t(messages.itemCount, { count: 4 }))).toBe('You have 4 items');
		});

		it('accepts the markdown function form with colors and emits ANSI codes', () => {
			const messages = defineMessages({
				en: {
					highlighted: {
						markdown: (md, colors) => md(`Pay attention: ${colors.red('this matters')}`),
						json: () => null,
					},
				},
			});

			const result = t(messages.highlighted);
			expect(stripAnsi(result)).toBe('Pay attention: this matters');
			expect(result).toContain('\x1b[31m');
		});

		it('infers ICU placeholders through colors helpers in the function form', () => {
			const messages = defineMessages({
				en: {
					warn: {
						markdown: (md, colors) => md(`${colors.yellow('Warning')}: actor {actorName} is missing`),
						json: () => null,
					},
				},
			});

			expectTypeOf<ArgsOfDescriptor<typeof messages.warn>>().toEqualTypeOf<{ actorName: string }>();

			expect(stripAnsi(t(messages.warn, { actorName: 'scraper' }))).toBe('Warning: actor scraper is missing');
		});

		it('preserves placeholders through chained colors helpers', () => {
			const messages = defineMessages({
				en: {
					critical: {
						markdown: (md, colors) => md(`${colors.bold.red('CRITICAL')}: {summary}`),
						json: () => null,
					},
				},
			});

			expectTypeOf<ArgsOfDescriptor<typeof messages.critical>>().toEqualTypeOf<{ summary: string }>();

			expect(stripAnsi(t(messages.critical, { summary: 'disk full' }))).toBe('CRITICAL: disk full');
		});

		it('throws when a required ICU placeholder is missing', () => {
			const messages = defineMessages({
				en: {
					actorWithNameExists: {
						markdown: 'An actor with the name {name} already exists',
						json: () => null,
					},
				},
			});

			// Cast through unknown to bypass the static check — we want to
			// verify the runtime error path from intl-messageformat.
			expect(() => t(messages.actorWithNameExists, {} as unknown as { name: string })).toThrow(/name/);
		});
	});

	describe('t() — markdown format', () => {
		it('returns raw markdown without ANSI codes', () => {
			const messages = defineMessages({
				en: {
					hello: {
						markdown: 'Welcome **friend**',
						json: () => null,
					},
				},
			});

			expect(t(messages.hello, { format: 'markdown' })).toBe('Welcome **friend**');
		});

		it('still substitutes ICU placeholders', () => {
			const messages = defineMessages({
				en: {
					note: {
						markdown: 'Hello **{name}**, you have {count,number} runs',
						json: () => null,
					},
				},
			});

			expect(t(messages.note, { name: 'Alice', count: 1234 }, { format: 'markdown' })).toBe(
				'Hello **Alice**, you have 1,234 runs',
			);
		});

		it('strips inline color helpers from the function form (level-0 chalk passes input through)', () => {
			const messages = defineMessages({
				en: {
					highlighted: {
						markdown: (md, colors) => md(`Pay attention: ${colors.red('this matters')}`),
						json: () => null,
					},
				},
			});

			expect(t(messages.highlighted, { format: 'markdown' })).toBe('Pay attention: this matters');
		});
	});

	describe('t() — json format', () => {
		it('spreads jsonParams into the json function and stringifies', () => {
			interface Actor {
				id: string;
				name: string;
			}

			const messages = defineMessages({
				en: {
					hi: {
						markdown: 'hi {actorName}',
						json: (actor: Actor) => ({ code: 'ok', id: actor.id }),
					},
				},
			});

			const actor: Actor = { id: 'abc', name: 'My Actor' };
			expect(t(messages.hi, { actorName: actor.name, jsonParams: [actor] }, { format: 'json' })).toBe(
				'{"code":"ok","id":"abc"}',
			);
		});

		it('passes multiple positional args through jsonParams', () => {
			const messages = defineMessages({
				en: {
					pair: {
						markdown: 'pair',
						json: (a: number, b: number) => ({ sum: a + b }),
					},
				},
			});

			expect(t(messages.pair, { jsonParams: [2, 3] }, { format: 'json' })).toBe('{"sum":5}');
		});

		it('stringifies an array returned by the json variant', () => {
			const messages = defineMessages({
				en: {
					ids: {
						markdown: 'ids',
						json: (ids: string[]) => ids,
					},
				},
			});

			expect(t(messages.ids, { jsonParams: [['a', 'b', 'c']] }, { format: 'json' })).toBe('["a","b","c"]');
		});

		it('stringifies a primitive returned by the json variant', () => {
			const messages = defineMessages({
				en: {
					count: {
						markdown: 'count',
						json: (n: number) => n,
					},
				},
			});

			expect(t(messages.count, { jsonParams: [42] }, { format: 'json' })).toBe('42');
		});

		it('returns "null" when the json variant returns null', () => {
			const messages = defineMessages({
				en: {
					nothing: {
						markdown: 'nothing',
						json: () => null,
					},
				},
			});

			expect(t(messages.nothing, { format: 'json' })).toBe('null');
		});

		it('returns "" when the json variant returns undefined', () => {
			const messages = defineMessages({
				en: {
					empty: {
						markdown: 'empty',
						json: () => undefined,
					},
				},
			});

			expect(t(messages.empty, { format: 'json' })).toBe('');
		});

		it('does not invoke the markdown function variant', () => {
			const markdownSpy = vitest.fn(() => 'should not run');
			const messages = defineMessages({
				en: {
					quiet: {
						markdown: markdownSpy,
						json: () => ({ ok: true }),
					},
				},
			});

			expect(t(messages.quiet, { format: 'json' })).toBe('{"ok":true}');
			expect(markdownSpy).not.toHaveBeenCalled();
		});

		it('does not feed jsonParams into ICU substitution', () => {
			const messages = defineMessages({
				en: {
					mixed: {
						markdown: 'name={name}',
						json: (id: string) => ({ id }),
					},
				},
			});

			// `jsonParams` must NOT show up in the rendered markdown text.
			expect(stripAnsi(t(messages.mixed, { name: 'alice', jsonParams: ['xyz'] }))).toBe('name=alice');
		});
	});

	describe('locale management', () => {
		it('exposes getLocale / setLocale', () => {
			expect(getLocale()).toBe('en');
			setLocale('de');
			expect(getLocale()).toBe('de');
		});

		it('uses the active locale variants when present', () => {
			const messages = defineMessages({
				en: {
					hello: { markdown: 'Hello {name}', json: () => null },
				},
				de: {
					hello: { markdown: 'Hallo {name}', json: () => null },
				},
			});

			setLocale('de');
			expect(stripAnsi(t(messages.hello, { name: 'Welt' }))).toBe('Hallo Welt');
		});

		it('falls back to en when the active locale has no translation', () => {
			const messages = defineMessages({
				en: {
					hello: { markdown: 'Hello {name}', json: () => null },
				},
			});

			setLocale('de');
			expect(stripAnsi(t(messages.hello, { name: 'Welt' }))).toBe('Hello Welt');
		});

		it('honors a per-call locale override', () => {
			const messages = defineMessages({
				en: {
					hello: { markdown: 'Hello', json: () => null },
				},
				de: {
					hello: { markdown: 'Hallo', json: () => null },
				},
			});

			expect(stripAnsi(t(messages.hello, { format: 'terminal', locale: 'de' }))).toBe('Hallo');
			expect(getLocale()).toBe('en');
		});
	});

	describe('supported locales', () => {
		it('exposes SUPPORTED_LOCALES with en included', () => {
			expect(SUPPORTED_LOCALES).toContain('en');
		});

		it('accepts any SUPPORTED_LOCALES entry as an optional key', () => {
			const messages = defineMessages({
				en: { hello: { markdown: 'Hello', json: () => null } },
				cs: { hello: { markdown: 'Ahoj', json: () => null } },
				fr: { hello: { markdown: 'Bonjour', json: () => null } },
			});

			expect(Object.keys(messages.hello.translations).sort()).toEqual(['cs', 'en', 'fr']);
		});

		it('rejects empty input and unknown locale keys at compile time', () => {
			const _assertions = () => {
				// @ts-expect-error -- the `en` locale is required
				defineMessages({});

				defineMessages({
					en: { hello: { markdown: 'Hello', json: () => null } },
					// @ts-expect-error -- 'xx' is not a supported locale
					xx: { hello: { markdown: 'Xx', json: () => null } },
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
					jsonHint: {
						markdown: "Send JSON like '{'key: value'}'",
						json: () => null,
					},
				},
			});

			expect(stripAnsi(t(messages.jsonHint, { format: 'markdown' }))).toBe('Send JSON like {key: value}');
		});

		it('combines escaped literal braces with real placeholders', () => {
			const messages = defineMessages({
				en: {
					bothBraces: {
						markdown: "Open '{' and insert {value}",
						json: () => null,
					},
				},
			});

			expect(t(messages.bothBraces, { value: 'x' }, { format: 'markdown' })).toBe('Open { and insert x');
		});
	});

	describe('markdownToAnsi', () => {
		it('renders inline code as cyan', () => {
			const out = markdownToAnsi('use `npm i` first');
			expect(stripAnsi(out)).toBe('use npm i first');
			// chalk.cyan SGR
			expect(out).toContain('\x1b[36m');
		});

		it('renders bold with the SGR bold code', () => {
			const out = markdownToAnsi('**hi**');
			expect(stripAnsi(out)).toBe('hi');
			expect(out).toContain('\x1b[1m');
		});

		it('renders italic from both * and _ markers', () => {
			expect(stripAnsi(markdownToAnsi('*hi*'))).toBe('hi');
			expect(stripAnsi(markdownToAnsi('_hi_'))).toBe('hi');
		});

		it('does not eat snake_case identifiers', () => {
			expect(stripAnsi(markdownToAnsi('see snake_case_var'))).toBe('see snake_case_var');
		});

		it('renders strikethrough', () => {
			expect(stripAnsi(markdownToAnsi('~~gone~~'))).toBe('gone');
		});

		it('renders [text](url) with the url visible', () => {
			const out = markdownToAnsi('[click](https://example.com) please');
			expect(stripAnsi(out)).toBe('click https://example.com please');
		});

		it('renders headers with the leading hashes stripped', () => {
			const out = markdownToAnsi('# Title');
			expect(stripAnsi(out)).toBe('Title');
		});

		it('does not transform code-span contents', () => {
			const out = markdownToAnsi('`**not bold**`');
			expect(stripAnsi(out)).toBe('**not bold**');
		});
	});

	describe('type inference (compile-time)', () => {
		interface Actor {
			id: string;
			name: string;
		}

		const messages = defineMessages({
			en: {
				noProps: {
					markdown: 'hi',
					json: () => null,
				},
				icuOnly: {
					markdown: 'Hello {name}',
					json: () => null,
				},
				multiIcu: {
					markdown: '{name} pushed {count,number} commits',
					json: () => null,
				},
				jsonOnly: {
					markdown: 'jsonOnly',
					json: (actor: Actor) => actor,
				},
				icuPlusJson: {
					markdown: 'hi {actorName}',
					json: (actor: Actor) => actor,
				},
			},
		});

		it('infers ICU-only messages as a flat object of placeholders', () => {
			expectTypeOf<ArgsOfDescriptor<typeof messages.noProps>>().toEqualTypeOf<Record<never, never>>();
			expectTypeOf<ArgsOfDescriptor<typeof messages.icuOnly>>().toEqualTypeOf<{ name: string }>();
			expectTypeOf<ArgsOfDescriptor<typeof messages.multiIcu>>().toEqualTypeOf<{
				name: string;
				count: number;
			}>();
		});

		it('infers json-only messages as { jsonParams: [...] }', () => {
			expectTypeOf<ArgsOfDescriptor<typeof messages.jsonOnly>>().toEqualTypeOf<{
				jsonParams: [actor: Actor];
			}>();
		});

		it('infers messages with both ICU and json args as the union', () => {
			expectTypeOf<ArgsOfDescriptor<typeof messages.icuPlusJson>>().toEqualTypeOf<{
				actorName: string;
				jsonParams: [actor: Actor];
			}>();
		});

		it('infers ICU placeholders even through colors helpers in the function form (via md())', () => {
			const msgs = defineMessages({
				en: {
					warn: {
						markdown: (md, colors) => md(`${colors.yellow('Warn')}: actor {actorName} is missing`),
						json: () => null,
					},
				},
			});

			expectTypeOf<ArgsOfDescriptor<typeof msgs.warn>>().toEqualTypeOf<{ actorName: string }>();
			// Use the value at runtime too so eslint doesn't flag it as type-only.
			expect(stripAnsi(t(msgs.warn, { actorName: 'scraper' }))).toBe('Warn: actor scraper is missing');
		});

		it('exposes the helpers used by ArgsOfDescriptor', () => {
			expectTypeOf<MarkdownSourceOf<{ markdown: 'hi {x}'; json: () => null }>>().toEqualTypeOf<'hi {x}'>();
			expectTypeOf<JsonArgsOf<{ markdown: 'x'; json: (a: number) => unknown }>>().toEqualTypeOf<[a: number]>();
			expectTypeOf<ExtractArgs<'hi {name}'>>().toEqualTypeOf<{ name: string }>();
			expectTypeOf<CombinedProps<{ markdown: 'hi {n}'; json: (a: string) => unknown }>>().toEqualTypeOf<{
				n: string;
				jsonParams: [a: string];
			}>();
		});

		it('accepts well-typed t() call shapes', () => {
			expect(t(messages.noProps)).toBe('hi');
			expect(stripAnsi(t(messages.icuOnly, { name: 'a' }))).toBe('Hello a');
			expect(stripAnsi(t(messages.multiIcu, { name: 'a', count: 1 }))).toBe('a pushed 1 commits');

			const actor: Actor = { id: '1', name: 'A' };
			expect(t(messages.jsonOnly, { jsonParams: [actor] }, { format: 'json' })).toBe('{"id":"1","name":"A"}');
			expect(stripAnsi(t(messages.icuPlusJson, { actorName: 'A', jsonParams: [actor] }))).toBe('hi A');
		});

		it('rejects mismatched t() call shapes at compile time', () => {
			const _assertions = () => {
				const actor: Actor = { id: '1', name: 'A' };

				// @ts-expect-error -- noProps takes no values
				t(messages.noProps, { name: 'a' });
				// @ts-expect-error -- icuOnly requires a values object
				t(messages.icuOnly);
				// @ts-expect-error -- name must be a string
				t(messages.icuOnly, { name: 1 });
				// @ts-expect-error -- count must be a number
				t(messages.multiIcu, { name: 'a', count: 'nope' });
				// @ts-expect-error -- jsonParams is required
				t(messages.jsonOnly, {});
				// @ts-expect-error -- jsonParams element must be an Actor
				t(messages.icuPlusJson, { actorName: 'A', jsonParams: ['not-an-actor'] });
				// @ts-expect-error -- icuPlusJson needs both keys
				t(messages.icuPlusJson, { jsonParams: [actor] });
			};

			expect(typeof _assertions).toBe('function');
		});

		it('MessageDescriptor carries the variants type in its generic', () => {
			expectTypeOf(messages.icuOnly).toExtend<MessageDescriptor>();
		});
	});
});
