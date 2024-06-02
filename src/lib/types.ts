export interface AuthJSON {
	token?: string;
	id?: string;
	username?: string;
	email?: string;
	proxy?: {
		password: string;
	};
	organizationOwnerUserId?: string;
}
