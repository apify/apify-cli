import { INPUT_FILE_REG_EXP } from '../../../src/lib/consts.js';

describe('Consts', () => {
	describe('INPUT_FILE_REG_EXP', () => {
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
				expect(!!value.text.match(INPUT_FILE_REG_EXP)).toEqual(value.match);
			});
		});
	});
});
