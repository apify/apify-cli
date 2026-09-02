// oxlint-disable
// @generated schema-ts v1-641d818735632fe7 — do not edit

export type Place = {
	webResults?: Array<unknown> | undefined;
	userPlaceNote?: string | undefined;
	tableReservationLinks?: Array<unknown> | undefined;
	tableReservationProviders?: Array<unknown> | undefined;
	bookingLinks?: Array<unknown> | undefined;
	orderOnline?:
		| {
				pickUps: Array<unknown>;
				deliveries: Array<unknown>;
		  }
		| undefined;
	questionsAndAnswers?: unknown;
	ownerUpdates?: Array<unknown> | undefined;
	restaurantData?:
		| {
				tableReservationProvider?: unknown;
		  }
		| undefined;
	reviewsCount: number | null;
	title: string;
	placeId: string;
	address: string | null;
	location: unknown;
	categories: Array<string>;
	isAdvertisement: boolean;
	categoryName: string | null;
	totalScore: number | null;
	permanentlyClosed: boolean;
	temporarilyClosed: boolean;
	url: string;
	price: string | null;
	cid: string | null;
	fid: string | null;
	imageUrl: string | null;
	hotelStars: string | null;
	scrapedAt: string;
	searchPageUrl?: string | undefined;
	searchString?: string | undefined;
	inputPlaceId?: string | undefined;
	inputStartUrl?: string | undefined;
	language: string;
	rank?: number | undefined;
	kgmid: string | null;
	businessProfileId: string | null;
	neighborhood: string | null;
	street: string | null;
	city: string | null;
	countryCode: string | null;
	postalCode: string | null;
	state: string | null;
	emails?: Array<string> | undefined;
	phones?: Array<string> | undefined;
	phonesUncertain?: Array<string> | undefined;
	linkedIns?: Array<string> | undefined;
	twitters?: Array<string> | undefined;
	instagrams?: Array<string> | undefined;
	facebooks?: Array<string> | undefined;
	youtubes?: Array<string> | undefined;
	tiktoks?: Array<string> | undefined;
	pinterests?: Array<string> | undefined;
	discords?: Array<string> | undefined;
	facebookProfiles?: Array<unknown> | undefined;
	instagramProfiles?: Array<unknown> | undefined;
	youtubeProfiles?: Array<unknown> | undefined;
	tiktokProfiles?: Array<unknown> | undefined;
	twitterProfiles?: Array<unknown> | undefined;
	description: string | null;
	phone: string | null;
	phoneUnformatted: string | null;
	imagesCount: number;
	openingHours?: unknown;
	additionalOpeningHours?: Record<string, unknown> | undefined;
	claimThisBusiness?: boolean | undefined;
	peopleAlsoSearch?: Array<unknown> | undefined;
	additionalInfo?: unknown;
	reviewsTags?: Array<unknown> | undefined;
	placesTags?: Array<unknown> | undefined;
	imageCategories: Array<string>;
	gasPrices: Array<unknown>;
	reserveTableUrl: string | null;
	googleFoodUrl?: string | null | undefined;
	website?: string | undefined;
	leadsEnrichment?: Array<unknown> | undefined;
	parentPlaceUrl?: string | undefined;
	hotelDescription: string | null;
	checkInDate: string | null;
	checkOutDate: string | null;
	similarHotelsNearby?:
		| Array<{
				name: string | null;
				rating: number | null;
				reviews: number | null;
				description: string | null;
				price: string | null;
		  }>
		| undefined;
	hotelReviewSummary?: unknown;
	hotelAds?: Array<unknown> | undefined;
	subTitle: string | null;
	ownerDescription: string | null;
	menu: string | null;
	servicesLink: string | null;
	locatedIn: string | null;
	floor: string | null;
	plusCode: string | null;
	reviewsDistribution?: unknown;
	reviewsRemovedNotice?: unknown;
	updatesFromCustomers?: unknown;
	openingHoursBusinessConfirmationText?: string | undefined;
	wasOpenAtScrapeTime: boolean | null;
	popularTimesLiveText: string | null;
	popularTimesLivePercent: number | null;
	popularTimesHistogram: Record<
		string,
		Array<{
			hour: number;
			occupancyPercent: number;
		}>
	>;
	isExternalServicePlace?: boolean | undefined;
	externalServiceProvider?: string | null | undefined;
	externalId?: string | undefined;
};

export type PlaceDraft = {
	webResults?: Array<unknown> | undefined;
	userPlaceNote?: string | undefined;
	tableReservationLinks?: Array<unknown> | undefined;
	tableReservationProviders?: Array<unknown> | undefined;
	bookingLinks?: Array<unknown> | undefined;
	orderOnline?:
		| ({
				pickUps: Array<unknown>;
				deliveries: Array<unknown>;
		  } & Record<string, unknown>)
		| undefined;
	questionsAndAnswers?: unknown;
	ownerUpdates?: Array<unknown> | undefined;
	restaurantData?:
		| ({
				tableReservationProvider?: unknown;
		  } & Record<string, unknown>)
		| undefined;
	reviewsCount: number | null;
	title: string;
	placeId: string;
	address: string | null;
	location: unknown;
	categories: Array<string>;
	isAdvertisement: boolean;
	categoryName: string | null;
	totalScore: number | null;
	permanentlyClosed: boolean;
	temporarilyClosed: boolean;
	url: string;
	price: string | null;
	cid: string | null;
	fid: string | null;
	imageUrl: string | null;
	hotelStars: string | null;
	scrapedAt: string;
	searchPageUrl?: string | undefined;
	searchString?: string | undefined;
	inputPlaceId?: string | undefined;
	inputStartUrl?: string | undefined;
	language: string;
	rank?: number | undefined;
	kgmid: string | null;
	businessProfileId: string | null;
	neighborhood: string | null;
	street: string | null;
	city: string | null;
	countryCode: string | null;
	postalCode: string | null;
	state: string | null;
	emails?: Array<string> | undefined;
	phones?: Array<string> | undefined;
	phonesUncertain?: Array<string> | undefined;
	linkedIns?: Array<string> | undefined;
	twitters?: Array<string> | undefined;
	instagrams?: Array<string> | undefined;
	facebooks?: Array<string> | undefined;
	youtubes?: Array<string> | undefined;
	tiktoks?: Array<string> | undefined;
	pinterests?: Array<string> | undefined;
	discords?: Array<string> | undefined;
	facebookProfiles?: Array<unknown> | undefined;
	instagramProfiles?: Array<unknown> | undefined;
	youtubeProfiles?: Array<unknown> | undefined;
	tiktokProfiles?: Array<unknown> | undefined;
	twitterProfiles?: Array<unknown> | undefined;
	description: string | null;
	phone: string | null;
	phoneUnformatted: string | null;
	imagesCount: number;
	openingHours?: unknown;
	additionalOpeningHours?: Record<string, unknown> | undefined;
	claimThisBusiness?: boolean | undefined;
	peopleAlsoSearch?: Array<unknown> | undefined;
	additionalInfo?: unknown;
	reviewsTags?: Array<unknown> | undefined;
	placesTags?: Array<unknown> | undefined;
	imageCategories: Array<string>;
	gasPrices: Array<unknown>;
	reserveTableUrl: string | null;
	googleFoodUrl?: string | null | undefined;
	website?: string | undefined;
	leadsEnrichment?: Array<unknown> | undefined;
	parentPlaceUrl?: string | undefined;
	hotelDescription: string | null;
	checkInDate: string | null;
	checkOutDate: string | null;
	similarHotelsNearby?:
		| Array<
				{
					name: string | null;
					rating: number | null;
					reviews: number | null;
					description: string | null;
					price: string | null;
				} & Record<string, unknown>
		  >
		| undefined;
	hotelReviewSummary?: unknown;
	hotelAds?: Array<unknown> | undefined;
	subTitle: string | null;
	ownerDescription: string | null;
	menu: string | null;
	servicesLink: string | null;
	locatedIn: string | null;
	floor: string | null;
	plusCode: string | null;
	reviewsDistribution?: unknown;
	reviewsRemovedNotice?: unknown;
	updatesFromCustomers?: unknown;
	openingHoursBusinessConfirmationText?: string | undefined;
	wasOpenAtScrapeTime: boolean | null;
	popularTimesLiveText: string | null;
	popularTimesLivePercent: number | null;
	popularTimesHistogram: Record<
		string,
		Array<
			{
				hour: number;
				occupancyPercent: number;
			} & Record<string, unknown>
		>
	>;
	isExternalServicePlace?: boolean | undefined;
	externalServiceProvider?: string | null | undefined;
	externalId?: string | undefined;
} & Record<string, unknown>;
