// oxlint-disable
// @generated schema-ts v1-7da5060298a63eb7 — do not edit

export type Connection = {
	authorMeta?:
		| {
				id?: string | null | undefined;
				name?: string | null | undefined;
				profileUrl?: string | null | undefined;
				verified?: boolean | null | undefined;
				privateAccount?: boolean | null | undefined;
				nickName?: string | null | undefined;
				avatar?: string | null | undefined;
				signature?: string | null | undefined;
				bioLink?: string | null | undefined;
				region?: string | null | undefined;
				following?: number | null | undefined;
				fans?: number | null | undefined;
				video?: number | null | undefined;
				heart?: number | null | undefined;
				digg?: number | null | undefined;
				friends?: number | null | undefined;
				commerceUserInfo?:
					| {
							commerceUser?: boolean | null | undefined;
							category?: string | null | undefined;
					  }
					| null
					| undefined;
				isUnderAge18?: boolean | null | undefined;
				roomId?: string | null | undefined;
				ttSeller?: boolean | null | undefined;
				createTime?: number | null | undefined;
				followDatasetUrl?: string | null | undefined;
				originalAvatarUrl?: string | null | undefined;
		  }
		| null
		| undefined;
	connectedTo?:
		| {
				id?: string | null | undefined;
				name?: string | null | undefined;
				profileUrl?: string | null | undefined;
				verified?: boolean | null | undefined;
				privateAccount?: boolean | null | undefined;
				nickName?: string | null | undefined;
				avatar?: string | null | undefined;
				signature?: string | null | undefined;
				bioLink?: string | null | undefined;
				region?: string | null | undefined;
				following?: number | null | undefined;
				fans?: number | null | undefined;
				video?: number | null | undefined;
				heart?: number | null | undefined;
				digg?: number | null | undefined;
				friends?: number | null | undefined;
				commerceUserInfo?:
					| {
							commerceUser?: boolean | null | undefined;
							category?: string | null | undefined;
					  }
					| null
					| undefined;
				isUnderAge18?: boolean | null | undefined;
				roomId?: string | null | undefined;
				ttSeller?: boolean | null | undefined;
				createTime?: number | null | undefined;
				followDatasetUrl?: string | null | undefined;
				originalAvatarUrl?: string | null | undefined;
		  }
		| null
		| undefined;
	connectionType?: string | null | undefined;
	connectionDescription?: string | null | undefined;
};

export type ConnectionDraft = {
	authorMeta?:
		| ({
				id?: string | null | undefined;
				name?: string | null | undefined;
				profileUrl?: string | null | undefined;
				verified?: boolean | null | undefined;
				privateAccount?: boolean | null | undefined;
				nickName?: string | null | undefined;
				avatar?: string | null | undefined;
				signature?: string | null | undefined;
				bioLink?: string | null | undefined;
				region?: string | null | undefined;
				following?: number | null | undefined;
				fans?: number | null | undefined;
				video?: number | null | undefined;
				heart?: number | null | undefined;
				digg?: number | null | undefined;
				friends?: number | null | undefined;
				commerceUserInfo?:
					| ({
							commerceUser?: boolean | null | undefined;
							category?: string | null | undefined;
					  } & Record<string, unknown>)
					| null
					| undefined;
				isUnderAge18?: boolean | null | undefined;
				roomId?: string | null | undefined;
				ttSeller?: boolean | null | undefined;
				createTime?: number | null | undefined;
				followDatasetUrl?: string | null | undefined;
				originalAvatarUrl?: string | null | undefined;
		  } & Record<string, unknown>)
		| null
		| undefined;
	connectedTo?:
		| ({
				id?: string | null | undefined;
				name?: string | null | undefined;
				profileUrl?: string | null | undefined;
				verified?: boolean | null | undefined;
				privateAccount?: boolean | null | undefined;
				nickName?: string | null | undefined;
				avatar?: string | null | undefined;
				signature?: string | null | undefined;
				bioLink?: string | null | undefined;
				region?: string | null | undefined;
				following?: number | null | undefined;
				fans?: number | null | undefined;
				video?: number | null | undefined;
				heart?: number | null | undefined;
				digg?: number | null | undefined;
				friends?: number | null | undefined;
				commerceUserInfo?:
					| ({
							commerceUser?: boolean | null | undefined;
							category?: string | null | undefined;
					  } & Record<string, unknown>)
					| null
					| undefined;
				isUnderAge18?: boolean | null | undefined;
				roomId?: string | null | undefined;
				ttSeller?: boolean | null | undefined;
				createTime?: number | null | undefined;
				followDatasetUrl?: string | null | undefined;
				originalAvatarUrl?: string | null | undefined;
		  } & Record<string, unknown>)
		| null
		| undefined;
	connectionType?: string | null | undefined;
	connectionDescription?: string | null | undefined;
} & Record<string, unknown>;
