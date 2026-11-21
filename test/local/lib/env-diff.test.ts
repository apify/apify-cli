import { diffEnvVars } from '../../../src/lib/env-diff.js';

describe('diffEnvVars()', () => {
	it('finds no difference when names and plain values match', () => {
		expect(
			diffEnvVars({ A: '1', B: '2' }, [
				{ name: 'A', isSecret: false, value: '1' },
				{ name: 'B', isSecret: false, value: '2' },
			]),
		).toStrictEqual({
			onlyInDotEnv: [],
			onlyOnPlatform: [],
			differentValues: [],
		});
	});

	it('lists names only in .env', () => {
		expect(diffEnvVars({ A: '1' }, []).onlyInDotEnv).toStrictEqual(['A']);
	});

	it('lists names only on the platform, plain and secret', () => {
		expect(
			diffEnvVars({}, [
				{ name: 'PLAIN', isSecret: false, value: 'x' },
				{ name: 'SECRET', isSecret: true },
			]).onlyOnPlatform,
		).toStrictEqual(['PLAIN', 'SECRET']);
	});

	it('lists plain variables whose values differ', () => {
		expect(diffEnvVars({ C: '1' }, [{ name: 'C', isSecret: false, value: '2' }]).differentValues).toStrictEqual(['C']);
	});

	it('treats an empty local value as different from a plain value', () => {
		expect(diffEnvVars({ C: '' }, [{ name: 'C', isSecret: false, value: 'x' }]).differentValues).toStrictEqual(['C']);
	});

	it('matches secrets by name only', () => {
		const platform = [{ name: 'S', isSecret: true, value: 'ignored' }];

		expect(diffEnvVars({ S: 'anything' }, platform).differentValues).toStrictEqual([]);
		expect(diffEnvVars({ S: '' }, platform).differentValues).toStrictEqual([]);
	});

	it('sorts every list by name', () => {
		const diff = diffEnvVars({ Z: '1', A: '1', Y: '1', B: '1' }, [
			{ name: 'Y', isSecret: false, value: '2' },
			{ name: 'B', isSecret: false, value: '2' },
			{ name: 'Q', isSecret: false, value: '1' },
			{ name: 'C', isSecret: true },
		]);

		expect(diff).toStrictEqual({
			onlyInDotEnv: ['A', 'Z'],
			onlyOnPlatform: ['C', 'Q'],
			differentValues: ['B', 'Y'],
		});
	});
});
