import { describe, expect, it } from 'vitest';

import { getUserPlanPricing } from '../../src/lib/commands/storage-size.js';

describe('getUserPlanPricing', () => {
	it('exposes distinct dataset and key-value store storage rates', () => {
		const pricing = getUserPlanPricing({
			id: 'FREE',
			planPricing: {
				chargeableServiceUnitPricesUsd: {
					DATASET_TIMED_STORAGE_GBYTE_HOURS: 0.0002,
					KEY_VALUE_STORE_TIMED_STORAGE_GBYTE_HOURS: 0.0004,
				},
			},
		} as never);

		expect(pricing).not.toBeNull();
		expect(pricing!.DATASET_TIMED_STORAGE_GBYTE_HOURS).toBe(0.0002);
		expect(pricing!.KEY_VALUE_STORE_TIMED_STORAGE_GBYTE_HOURS).toBe(0.0004);
		expect(pricing!.DATASET_TIMED_STORAGE_GBYTE_HOURS).not.toBe(pricing!.KEY_VALUE_STORE_TIMED_STORAGE_GBYTE_HOURS);
	});

	it('returns null when plan pricing is missing', () => {
		expect(getUserPlanPricing({ id: 'FREE' } as never)).toBeNull();
	});
});
