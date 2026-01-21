import { AuthLogoutCommand } from './auth/logout.js';

export class LogoutCommand extends AuthLogoutCommand {
	static override name = 'logout' as const;
}
