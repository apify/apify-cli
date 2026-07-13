import { getConsoleBaseUrl } from '../../../src/lib/consts.js';
import { inputFileRegExp } from '../../../src/lib/input-key.js';

describe('Consts', () => {
	describe('getConsoleBaseUrl', () => {
		const originalConsoleBaseUrl = process.env.APIFY_CONSOLE_BASE_URL;

		afterEach(() => {
			if (originalConsoleBaseUrl === undefined) {
				delete process.env.APIFY_CONSOLE_BASE_URL;
			} else {
				process.env.APIFY_CONSOLE_BASE_URL = originalConsoleBaseUrl;
			}
		});

		it('defaults to the production Console URL when unset', () => {
			delete process.env.APIFY_CONSOLE_BASE_URL;
			expect(getConsoleBaseUrl()).toBe('https://console.apify.com');
		});

		it('uses APIFY_CONSOLE_BASE_URL when set', () => {
			process.env.APIFY_CONSOLE_BASE_URL = 'http://localhost:3000';
			expect(getConsoleBaseUrl()).toBe('http://localhost:3000');
		});

		it('strips a trailing slash from the env value so path composition does not double up', () => {
			process.env.APIFY_CONSOLE_BASE_URL = 'http://localhost:3000/';
			expect(getConsoleBaseUrl()).toBe('http://localhost:3000');
		});
	});

	describe('inputFileRegExp', () => {
		const testValues = [
			{
				text: 'INPUT.json',
				match: true,
			},
			{
				text: 'INPUT.png',
				match: true,
			},
			{
				text: 'INPUT_.json',
				match: false,
			},
			{
				text: 'bla_INPUT.json',
				match: false,
			},
			{
				text: 'bla_bla.json',
				match: false,
			},
		];

		testValues.forEach((value) => {
			it(`should match ${value.text}`, () => {
				expect(!!value.text.match(inputFileRegExp('INPUT'))).toEqual(value.match);
			});
		});
	});
});
