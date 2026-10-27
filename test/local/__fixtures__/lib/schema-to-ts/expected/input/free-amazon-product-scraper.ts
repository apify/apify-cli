// oxlint-disable
// @generated schema-ts v1-25c4855449863324 — do not edit

export type Input = {
	categoryUrls: Array<unknown>;
	maxItemsPerStartUrl?: number | undefined;
	maxSearchPagesPerStartUrl?: number | undefined;
	maxProductVariantsAsSeparateResults?: number | undefined;
	useCaptchaSolver: boolean;
	scrapeProductVariantPrices: boolean;
	scrapeProductDetails: boolean | null;
};

export type InputArgs = {
	categoryUrls: Array<unknown>;
	maxItemsPerStartUrl?: number | undefined;
	maxSearchPagesPerStartUrl?: number | undefined;
	maxProductVariantsAsSeparateResults?: number | undefined;
	useCaptchaSolver?: boolean | undefined;
	scrapeProductVariantPrices?: boolean | undefined;
	scrapeProductDetails?: boolean | null | undefined;
} & Record<string, unknown>;
