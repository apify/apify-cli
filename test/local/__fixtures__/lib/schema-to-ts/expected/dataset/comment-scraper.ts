// oxlint-disable
// @generated schema-ts v1-55348b59cbce2e42 — do not edit

export type Comment = {
	postUrl?: string | null | undefined;
	commentUrl?: string | null | undefined;
	id?: string | null | undefined;
	text?: string | null | undefined;
	ownerUsername?: string | null | undefined;
	ownerProfilePicUrl?: string | null | undefined;
	timestamp?: string | null | undefined;
	likesCount?: number | null | undefined;
	owner?:
		| {
				fbid_v2?: string | null | undefined;
				id?: string | null | undefined;
				is_verified?: boolean | null | undefined;
				profile_pic_url?: string | null | undefined;
				username?: string | null | undefined;
				full_name?: string | null | undefined;
				is_mentionable?: boolean | null | undefined;
				is_private?: boolean | null | undefined;
				latest_reel_media?: number | null | undefined;
				profile_pic_id?: string | null | undefined;
		  }
		| null
		| undefined;
	url?: string | null | undefined;
	parentCommentUrl?: string | null | undefined;
	requestErrorMessages?: Array<string> | null | undefined;
	error?: string | null | undefined;
	errorDescription?: string | null | undefined;
	repliesCount?: number | null | undefined;
	replies?: Array<Record<string, unknown>> | null | undefined;
};

export type CommentDraft = {
	postUrl?: string | null | undefined;
	commentUrl?: string | null | undefined;
	id?: string | null | undefined;
	text?: string | null | undefined;
	ownerUsername?: string | null | undefined;
	ownerProfilePicUrl?: string | null | undefined;
	timestamp?: string | null | undefined;
	likesCount?: number | null | undefined;
	owner?:
		| ({
				fbid_v2?: string | null | undefined;
				id?: string | null | undefined;
				is_verified?: boolean | null | undefined;
				profile_pic_url?: string | null | undefined;
				username?: string | null | undefined;
				full_name?: string | null | undefined;
				is_mentionable?: boolean | null | undefined;
				is_private?: boolean | null | undefined;
				latest_reel_media?: number | null | undefined;
				profile_pic_id?: string | null | undefined;
		  } & Record<string, unknown>)
		| null
		| undefined;
	url?: string | null | undefined;
	parentCommentUrl?: string | null | undefined;
	requestErrorMessages?: Array<string> | null | undefined;
	error?: string | null | undefined;
	errorDescription?: string | null | undefined;
	repliesCount?: number | null | undefined;
	replies?: Array<Record<string, unknown>> | null | undefined;
} & Record<string, unknown>;
