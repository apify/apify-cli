import type { UserPlan } from 'apify-client';

export function getUserPlanPricing(userPlan: UserPlan) {
	const planPricing = Reflect.get(userPlan, 'planPricing');

	if (!planPricing) {
		return null;
	}

	return Reflect.get(planPricing, 'chargeableServiceUnitPricesUsd') as {
		DATASET_TIMED_STORAGE_GBYTE_HOURS: number;
		KEY_VALUE_STORE_TIMED_STORAGE_GBYTE_HOURS: number;
	} | null;
}
