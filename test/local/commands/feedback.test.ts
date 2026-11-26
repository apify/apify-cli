import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

import type { Mock } from 'vitest';

import { FeedbackCommand } from '../../../src/commands/feedback.js';
import { upsertProfile, writeProfileSecret } from '../../../src/lib/auth-file.js';
import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { TELEMETRY_FILE_PATH } from '../../../src/lib/consts.js';
import { useAuthSetup } from '../../__setup__/hooks/useAuthSetup.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';

// Also isolates the telemetry state file: TELEMETRY_FILE_PATH resolves under the per-test config folder.
// Its afterEach restores the env vars stubbed below.
useAuthSetup();

const { logMessages, lastErrorMessage } = useConsoleSpy();

let fetchMock: Mock<typeof fetch>;

function writeTelemetryState(state: Record<string, unknown>) {
	mkdirSync(dirname(TELEMETRY_FILE_PATH()), { recursive: true });
	writeFileSync(
		TELEMETRY_FILE_PATH(),
		JSON.stringify({ version: 1, enabled: true, anonymousId: 'CLI:test-anonymous-id', ...state }),
	);
}

function sentRequests() {
	return fetchMock.mock.calls.map(([url, init]) => ({ url, body: JSON.parse(init!.body as string) }));
}

beforeEach(() => {
	fetchMock = vi.fn<typeof fetch>(async () => new Response('{"success":true}', { status: 200 }));
	vi.stubGlobal('fetch', fetchMock);

	writeTelemetryState({ lastCommand: 'actors push', lastCommandTimestamp: Date.now(), lastCommandExitCode: 2 });
});

afterEach(() => {
	vi.unstubAllGlobals();
	process.exitCode = undefined;
});

describe('apify feedback', () => {
	it('sends the report with every field and thanks the user', async () => {
		vi.stubEnv('APIFY_CLI_DISABLE_TELEMETRY', '0');

		await testRunCommand(FeedbackCommand, {
			args_message: '  push hangs after the build finishes  ',
			flags_actorId: 'abc123',
			flags_actorRunId: 'run456',
			flags_category: 'bug',
			flags_sentiment: 'negative',
			flags_source: 'user',
			flags_expected: 'The push finishes.',
			flags_actual: 'It hangs forever.',
		});

		const requests = sentRequests();
		expect(requests).toHaveLength(1);

		const [{ url, body }] = requests;
		expect(url).toBe('https://api.segment.io/v1/track');
		expect(body.event).toBe('CLI Reported Problem');
		expect(body.anonymousId).toBe('CLI:test-anonymous-id');
		expect(body.properties).toMatchObject({
			message: 'push hangs after the build finishes',
			actor_id: 'abc123',
			actor_run_id: 'run456',
			category: 'bug',
			sentiment: 'negative',
			source: 'user',
			expected: 'The push finishes.',
			actual: 'It hangs forever.',
			last_command: 'actors push',
			last_command_exit_code: 2,
			app: 'cli',
		});
		expect(body.properties.app_version).toEqual(expect.any(String));
		expect(body.properties.os).toEqual(expect.any(String));
		expect(body.properties.os_arch).toEqual(expect.any(String));
		expect(body.properties.install_method).toEqual(expect.any(String));

		expect(process.exitCode).toBeFalsy();
		expect(logMessages.error.join('\n')).toMatch(/thanks for your feedback/i);
	});

	it('sends the report even when telemetry is disabled', async () => {
		vi.stubEnv('APIFY_CLI_DISABLE_TELEMETRY', '1');
		writeTelemetryState({ enabled: false });

		await testRunCommand(FeedbackCommand, { args_message: 'it worked' });

		const requests = sentRequests();
		expect(requests).toHaveLength(1);
		expect(requests[0].body.event).toBe('CLI Reported Problem');
		expect(requests[0].body.properties.message).toBe('it worked');
		// Options the user didn't pass are left out rather than sent empty.
		expect(requests[0].body.properties).not.toHaveProperty('actor_id');
		expect(requests[0].body.properties).not.toHaveProperty('category');
		expect(process.exitCode).toBeFalsy();
	});

	it.each([
		['the request fails', async () => Promise.reject(new TypeError('fetch failed'))],
		['Segment rejects the event', async () => new Response('bad request', { status: 400 })],
	])('fails with exit code 1 when %s', async (_, impl) => {
		fetchMock.mockImplementation(impl);

		await testRunCommand(FeedbackCommand, { args_message: 'push hangs' });

		expect(process.exitCode).toBe(1);
		expect(lastErrorMessage()).toMatch(/couldn't be sent/);
		expect(lastErrorMessage()).toContain('https://github.com/apify/apify-cli/issues');
		expect(logMessages.error.join('\n')).not.toMatch(/thanks for your feedback/i);
		expect(logMessages.log).toEqual([]);
	});

	it('prints a JSON result with --json', async () => {
		await testRunCommand(FeedbackCommand, { args_message: 'push hangs', flags_json: true });

		expect(fetchMock).toHaveBeenCalledOnce();
		expect(JSON.parse(logMessages.log.join('\n'))).toEqual({ sent: true });
	});

	it('rejects a message over 2000 characters without sending anything', async () => {
		await testRunCommand(FeedbackCommand, { args_message: 'a'.repeat(2001) });

		expect(fetchMock).not.toHaveBeenCalled();
		expect(process.exitCode).toBe(1);
		expect(lastErrorMessage()).toContain('2000');
		expect(lastErrorMessage()).toContain('2001');
	});

	describe('credentials', () => {
		const secret = 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8';
		// A token from before tokens had a prefix: nothing about its shape gives it away.
		const unprefixedToken = 'Zx9Kq2Lm8Vb4Nc6Hd1Jf3Gs5';

		it.each([
			[
				'an Apify API token in the message',
				{ args_message: `apify call my-actor --token apify_api_${secret} returns 401` },
			],
			[
				'an Apify API token in a URL in --actual',
				{ args_message: 'call fails', flags_actual: `https://api.apify.com/v2/acts?token=apify_api_${secret}` },
			],
			['a token in --expected', { args_message: 'call fails', flags_expected: `apify_api_${secret} to work` }],
			['a token in --actor-id', { args_message: 'call fails', flags_actorId: `apify_api_${secret}` }],
			['a token in --actor-run-id', { args_message: 'call fails', flags_actorRunId: `apify_api_${secret}` }],
			['an unprefixed token after --token', { args_message: `apify login --token ${unprefixedToken} fails` }],
			['an unprefixed token in a query string', { args_message: `GET /v2/acts?token=${unprefixedToken} is 401` }],
			['a bearer token', { args_message: `curl -H "Authorization: Bearer ${unprefixedToken}" fails` }],
			['a password', { args_message: `proxy rejects password: ${unprefixedToken}` }],
		])('rejects %s without sending anything', async (_, input) => {
			await testRunCommand(FeedbackCommand, input);

			expect(fetchMock).not.toHaveBeenCalled();
			expect(process.exitCode).toBe(1);
			expect(lastErrorMessage()).toMatch(/Nothing was sent/);
			expect(lastErrorMessage()).not.toContain(secret);
			expect(lastErrorMessage()).not.toContain(unprefixedToken);
		});

		it('rejects the APIFY_TOKEN value even when nothing marks it as a token', async () => {
			vi.stubEnv('APIFY_TOKEN', unprefixedToken);

			await testRunCommand(FeedbackCommand, { args_message: `the run of ${unprefixedToken} never starts` });

			expect(fetchMock).not.toHaveBeenCalled();
			expect(process.exitCode).toBe(1);
		});

		it("rejects a stored account's token even when nothing marks it as a token", async () => {
			upsertProfile('uid', {
				name: null,
				authMethod: 'token',
				expiresAt: null,
				hasRefreshToken: false,
				loggedInAt: null,
			});
			writeProfileSecret('uid', 'token', unprefixedToken);

			await testRunCommand(FeedbackCommand, { args_message: `the run of ${unprefixedToken} never starts` });

			expect(fetchMock).not.toHaveBeenCalled();
			expect(process.exitCode).toBe(1);
		});

		it.each([
			'apify login --token <token> fails with 401',
			'apify call --token $APIFY_TOKEN fails',
			'export APIFY_TOKEN=YOUR_APIFY_TOKEN_HERE, then run apify push',
			'the token misconfiguration message is confusing',
			'apify_proxy_groups is ignored by apify run',
		])('still sends a report that only talks about tokens: %s', async (message) => {
			await testRunCommand(FeedbackCommand, { args_message: message });

			expect(sentRequests()).toHaveLength(1);
			expect(sentRequests()[0].body.properties.message).toBe(message);
		});
	});

	it('marks the report as sent by an agent when one is detected, unless --sent-by overrides it', async () => {
		vi.stubEnv('CLAUDECODE', '1');
		vi.stubEnv('CLAUDE_CODE_IS_COWORK', undefined);

		await testRunCommand(FeedbackCommand, { args_message: 'push hangs' });
		await testRunCommand(FeedbackCommand, { args_message: 'push hangs', flags_sentBy: 'human' });

		const [detected, overridden] = sentRequests();
		expect(detected.body.properties).toMatchObject({ sent_by: 'agent', ai_agent: 'claude_code' });
		expect(overridden.body.properties).toMatchObject({ sent_by: 'human', ai_agent: 'claude_code' });
	});

	describe('last command', () => {
		// testRunCommand skips the last-command bookkeeping, so run the command the way the entrypoint does.
		async function runLikeEntrypoint(args: string[]) {
			const instance = new FeedbackCommand('apify', 'feedback', 'feedback');
			const parsed = parseArgs({ ...instance['_buildParseArgsOption'](), args });

			await instance['_run'](parsed);
		}

		function recordedLastCommand() {
			const state = JSON.parse(readFileSync(TELEMETRY_FILE_PATH(), 'utf-8'));
			return { command: state.lastCommand, exitCode: state.lastCommandExitCode };
		}

		beforeEach(() => {
			vi.stubEnv('APIFY_CLI_DISABLE_TELEMETRY', '1');
		});

		it('still names the reported command in a second report', async () => {
			await runLikeEntrypoint(['push hangs']);
			await runLikeEntrypoint(['push still hangs']);

			const [first, second] = sentRequests();
			expect(first.body.properties).toMatchObject({ last_command: 'actors push', last_command_exit_code: 2 });
			expect(second.body.properties).toMatchObject({ last_command: 'actors push', last_command_exit_code: 2 });
			expect(recordedLastCommand()).toEqual({ command: 'actors push', exitCode: 2 });
		});
	});
});
