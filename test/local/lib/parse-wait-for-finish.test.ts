import { parseWaitForFinishMillis } from '../../../src/lib/utils.js';

describe('parseWaitForFinishMillis()', () => {
	it('returns undefined when flag is omitted', () => {
		expect(parseWaitForFinishMillis(undefined)).toBeUndefined();
	});

	it('returns undefined for non-numeric input', () => {
		expect(parseWaitForFinishMillis('abc')).toBeUndefined();
	});

	it('returns 0 for zero (no wait)', () => {
		expect(parseWaitForFinishMillis('0')).toBe(0);
	});

	it('returns undefined for negative values', () => {
		expect(parseWaitForFinishMillis('-5')).toBeUndefined();
	});

	it('converts positive seconds to milliseconds', () => {
		expect(parseWaitForFinishMillis('30')).toBe(30_000);
	});
});
