import type { ApiUserPlan } from '../api-overrides.js';

export function getUserPlanPricing(userPlan: ApiUserPlan) {
	return userPlan.planPricing?.chargeableServiceUnitPricesUsd ?? null;
}
