import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import process from 'node:process';

import type { AuthFile, AuthProfile } from '../../../src/lib/auth-file.js';
import { AUTH_FILE_PATH, CommandExitCodes, GLOBAL_CONFIGS_FOLDER } from '../../../src/lib/consts.js';
import { resetApifyClientMock } from '../../__setup__/apify-client-mock.js';
import { readAuthFile } from '../../__setup__/auth-file.js';
import { useAuthSetup } from '../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';

// Prompts take the non-interactive path, as they do in CI.
vi.mock('ci-info', async (importOriginal) => ({ ...(await importOriginal<typeof import('ci-info')>()), isCI: true }));

vi.mock('@napi-rs/keyring', () => import('../../__setup__/keyring-mock.js'));

vi.mock('apify-client', async (importOriginal) => ({
	...(await importOriginal<typeof import('apify-client')>()),
	ApifyClient: (await import('../../__setup__/apify-client-mock.js')).FakeApifyClient,
}));

useAuthSetup();
const { lastLogMessage, lastErrorMessage, logSpy } = useConsoleSpy();

const { AuthListCommand } = await import('../../../src/commands/auth/list.js');
const { AuthLogoutCommand } = await import('../../../src/commands/auth/logout.js');
const { AuthSwitchCommand } = await import('../../../src/commands/auth/switch.js');
const { AuthTokenCommand } = await import('../../../src/commands/auth/token.js');
const { CreateCommand } = await import('../../../src/commands/create.js');
const { InfoCommand } = await import('../../../src/commands/info.js');
const { InitCommand } = await import('../../../src/commands/init.js');
const { describeAuthFailure, resolveAuth, selectProfile } = await import('../../../src/lib/auth.js');
const { registerCommandForHelpGeneration, renderHelpForCommand } =
	await import('../../../src/lib/command-framework/help.js');
const { testRunCommand } = await import('../../../src/lib/command-framework/apify-command.js');
const { getCurrentUserInfo } = await import('../../../src/lib/utils.js');

const PROFILE: AuthProfile = {
	name: null,
	authMethod: 'token',
	expiresAt: null,
	hasRefreshToken: false,
	loggedInAt: null,
};

const twoProfiles = (overrides: Partial<AuthFile> = {}): AuthFile => ({
	version: 2,
	activeProfile: 'uid',
	secretsBackend: 'file',
	profiles: {
		uid: {
			...PROFILE,
			username: 'me',
			name: 'me',
			loggedInAt: '2026-03-01T00:00:00.000Z',
			token: 't-me',
			proxy: { password: 'pw-me' },
		},
		org: {
			...PROFILE,
			username: 'my-org',
			name: 'my-org',
			organizationOwnerUserId: 'uid',
			loggedInAt: '2026-02-01T00:00:00.000Z',
			token: 't-org',
			proxy: { password: 'pw-org' },
		},
	},
	...overrides,
});

const writeAuthFile = (data: unknown) => {
	mkdirSync(GLOBAL_CONFIGS_FOLDER(), { recursive: true });
	writeFileSync(AUTH_FILE_PATH(), JSON.stringify(data));
};

const takeExitCode = () => {
	const code = process.exitCode;
	process.exitCode = 0;
	return code;
};

describe('multi-account UX', () => {
	beforeEach(() => {
		resetApifyClientMock({ id: 'uid', username: 'me' });
		writeAuthFile(twoProfiles());
	});

	describe('--profile', () => {
		it('selects the named account for one command and leaves the active one alone', async () => {
			await testRunCommand(AuthTokenCommand, { flags_profile: 'my-org' });

			expect(lastLogMessage()).toBe('t-org');
			expect(readAuthFile().activeProfile).toBe('uid');
		});

		it('accepts a user ID', async () => {
			await testRunCommand(AuthTokenCommand, { flags_profile: 'org' });

			expect(lastLogMessage()).toBe('t-org');
		});

		it('matches a migrated v1 profile by its username', async () => {
			const file = twoProfiles();
			file.profiles!.org.name = null;
			writeAuthFile(file);

			await testRunCommand(AuthTokenCommand, { flags_profile: 'my-org' });

			expect(lastLogMessage()).toBe('t-org');
		});

		it('fails fast and lists the stored profiles when the name is unknown', async () => {
			await testRunCommand(AuthTokenCommand, { flags_profile: 'nope' });

			expect(lastErrorMessage()).toContain('No stored account is called "nope". Stored accounts: me, my-org.');
			expect(takeExitCode()).toBe(CommandExitCodes.InvalidInput);
		});

		it('errors when APIFY_TOKEN is set, even to the same token', async () => {
			vitest.stubEnv('APIFY_TOKEN', 't-org');

			await testRunCommand(AuthTokenCommand, { flags_profile: 'my-org' });

			expect(lastErrorMessage()).toContain('APIFY_TOKEN is set, so commands ignore --profile');
			expect(takeExitCode()).toBe(CommandExitCodes.InvalidInput);
		});

		it('gives the selected account proxy password to `apify run`', async () => {
			await selectProfile('my-org');

			expect(await getCurrentUserInfo()).toMatchObject({ id: 'org', proxy: { password: 'pw-org' } });
		});

		it('names the profile when its token is rejected', async () => {
			await selectProfile('my-org');
			const auth = await resolveAuth();

			expect(describeAuthFailure(auth)).toBe(
				'The stored API token for my-org was rejected. Run "apify login" to log in to my-org again.',
			);
		});

		it('says which profile has no token instead of saying the CLI is logged out', async () => {
			const file = twoProfiles();
			delete file.profiles!.org.token;
			writeAuthFile(file);

			await testRunCommand(AuthTokenCommand, { flags_profile: 'my-org' });

			expect(lastErrorMessage()).toContain('No API token is stored for my-org.');
			expect(takeExitCode()).toBe(CommandExitCodes.MissingAuth);
		});

		it('shows up in `info` as the token source', async () => {
			resetApifyClientMock({ id: 'org', username: 'my-org' });

			await testRunCommand(InfoCommand, { flags_profile: 'my-org' });

			const output = logSpy().mock.calls.flat().join('\n');
			expect(output).toContain('--profile flag');
			expect(output).toContain('my-org');
		});

		it('is offered on commands that call the API and not on offline ones', () => {
			expect(InitCommand.enableProfileFlag).toBe(false);

			registerCommandForHelpGeneration('apify', InitCommand);
			registerCommandForHelpGeneration('apify', InfoCommand);
			registerCommandForHelpGeneration('apify', CreateCommand);
			expect(renderHelpForCommand(InitCommand)).not.toContain('--profile');
			expect(renderHelpForCommand(InfoCommand)).toContain('--profile');
			expect(renderHelpForCommand(CreateCommand)).toContain('--profile');
		});
	});

	describe('auth switch', () => {
		it('makes the named account active', async () => {
			await testRunCommand(AuthSwitchCommand, { args_profile: 'my-org' });

			expect(readAuthFile().activeProfile).toBe('org');
			expect(lastErrorMessage()).toContain('my-org is now the active account.');

			await testRunCommand(AuthTokenCommand, {});
			expect(lastLogMessage()).toBe('t-org');
		});

		it('errors when APIFY_TOKEN is set', async () => {
			vitest.stubEnv('APIFY_TOKEN', 't-env');

			await testRunCommand(AuthSwitchCommand, { args_profile: 'my-org' });

			expect(lastErrorMessage()).toContain('APIFY_TOKEN is set, so commands ignore the active account');
			expect(takeExitCode()).toBe(CommandExitCodes.InvalidInput);
			expect(readAuthFile().activeProfile).toBe('uid');
		});

		it('errors instead of prompting in a non-interactive shell', async () => {
			await testRunCommand(AuthSwitchCommand, {});

			expect(lastErrorMessage()).toContain('Pass the account to switch to');
			expect(readAuthFile().activeProfile).toBe('uid');
			takeExitCode();
		});

		it('refuses an account whose token is gone', async () => {
			const file = twoProfiles();
			delete file.profiles!.org.token;
			writeAuthFile(file);

			await testRunCommand(AuthSwitchCommand, { args_profile: 'my-org' });

			expect(lastErrorMessage()).toContain('No API token is stored for my-org.');
			expect(takeExitCode()).toBe(CommandExitCodes.MissingAuth);
			expect(readAuthFile().activeProfile).toBe('uid');
		});
	});

	describe('auth list', () => {
		it('prints every profile from the file as JSON without calling the API', async () => {
			resetApifyClientMock({});
			const { clientState } = await import('../../__setup__/apify-client-mock.js');
			clientState.fail = true;

			await testRunCommand(AuthListCommand, { flags_json: true });

			expect(JSON.parse(lastLogMessage())).toEqual({
				envTokenInUse: false,
				profiles: [
					{
						id: 'uid',
						name: 'me',
						username: 'me',
						active: true,
						isOrganization: false,
						organizationOwnerUserId: null,
						loggedInAt: '2026-03-01T00:00:00.000Z',
						secretsBackend: 'file',
					},
					{
						id: 'org',
						name: 'my-org',
						username: 'my-org',
						active: false,
						isOrganization: true,
						organizationOwnerUserId: 'uid',
						loggedInAt: '2026-02-01T00:00:00.000Z',
						secretsBackend: 'file',
					},
				],
			});
		});

		it('marks the active profile and labels organizations', async () => {
			await testRunCommand(AuthListCommand, {});

			const output = lastLogMessage();
			expect(output).toContain('(active)');
			expect(output).toContain('Organization');
		});

		it('reports a file a newer CLI wrote instead of listing no accounts', async () => {
			writeAuthFile({ version: 99, profiles: { uid: PROFILE } });

			await testRunCommand(AuthListCommand, {});

			expect(lastErrorMessage()).toContain('written by a newer Apify CLI');
			takeExitCode();
		});

		it('says APIFY_TOKEN overrides the active profile', async () => {
			vitest.stubEnv('APIFY_TOKEN', 't-env');

			await testRunCommand(AuthListCommand, {});

			expect(lastErrorMessage()).toContain('APIFY_TOKEN is set, so commands use it instead of the active account.');
		});
	});

	describe('logout', () => {
		it('--profile removes that account and leaves the active one alone', async () => {
			await testRunCommand(AuthLogoutCommand, { flags_profile: 'my-org' });

			const file = readAuthFile();
			expect(file.activeProfile).toBe('uid');
			expect(file.profiles).not.toHaveProperty('org');
			expect(lastErrorMessage()).toContain('You are logged out of my-org. me is still the active account.');
		});

		it('--profile with the active account behaves like a plain logout', async () => {
			await testRunCommand(AuthLogoutCommand, { flags_profile: 'me' });

			expect(readAuthFile().activeProfile).toBe('org');
			expect(lastErrorMessage()).toContain('You are logged out of me. my-org is now the active account.');
		});

		it('--all with --yes removes every account', async () => {
			await testRunCommand(AuthLogoutCommand, { flags_all: true, flags_yes: true });

			expect(existsSync(AUTH_FILE_PATH())).toBe(false);
			expect(lastErrorMessage()).toContain('You are logged out of all your Apify accounts.');
		});

		it('--all without --yes needs a confirmation', async () => {
			await testRunCommand(AuthLogoutCommand, { flags_all: true });

			expect(lastErrorMessage()).toContain('Use --yes');
			expect(Object.keys(readAuthFile().profiles!)).toEqual(['uid', 'org']);
			takeExitCode();
		});

		it.each([{}, { flags_all: true }])(
			'with nothing stored says so instead of reporting success (%o)',
			async (flags) => {
				rmSync(AUTH_FILE_PATH());

				await testRunCommand(AuthLogoutCommand, flags);

				expect(lastErrorMessage()).toContain('No accounts are stored. Run "apify login" to add one.');
				expect(lastErrorMessage()).not.toContain('logged out');
				expect(process.exitCode ?? 0).toBe(0);
			},
		);
	});
});
