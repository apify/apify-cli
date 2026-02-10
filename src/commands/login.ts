import { AuthLoginCommand } from './auth/login.js';

export class LoginCommand extends AuthLoginCommand {
	static override name = 'login' as const;
}
