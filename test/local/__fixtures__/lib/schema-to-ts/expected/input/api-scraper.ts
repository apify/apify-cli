// oxlint-disable
// @generated schema-ts v1-5df1437f19b33bed — do not edit

export type Input = {
	directUrls?: Array<string> | undefined;
	resultsType: 'posts' | 'comments' | 'details' | 'mentions' | 'reels' | 'stories';
	resultsLimit?: number | undefined;
	onlyPostsNewerThan?: string | undefined;
	search?: string | undefined;
	searchType: 'user' | 'hashtag' | 'place';
	searchLimit?: number | undefined;
	addParentData: boolean;
};

export type InputArgs = {
	directUrls?: Array<string> | undefined;
	resultsType?: 'posts' | 'comments' | 'details' | 'mentions' | 'reels' | 'stories' | undefined;
	resultsLimit?: number | undefined;
	onlyPostsNewerThan?: string | undefined;
	search?: string | undefined;
	searchType?: 'user' | 'hashtag' | 'place' | undefined;
	searchLimit?: number | undefined;
	addParentData?: boolean | undefined;
} & Record<string, unknown>;
