import open from 'open';

import { connectViaConsole } from '../../../src/lib/git-source/connectViaConsole.js';

vi.mock('open', () => ({ default: vi.fn(async () => undefined) }));
vi.mock('computer-name', () => ({ default: () => 'test-machine' }));

/** Starts the hand-off and returns the URL it asked the browser to open, parsed. */
const startConnect = async (provider: string, label: string) => {
	const finished = connectViaConsole(provider, label);
	await vi.waitFor(() => expect(open).toHaveBeenCalled());

	const url = new URL(vi.mocked(open).mock.calls.at(-1)![0] as string);
	const port = url.searchParams.get('localCliPort')!;
	const token = url.searchParams.get('localCliToken')!;
	const callback = (path: string) => `http://127.0.0.1:${port}/api/v1/${path}`;

	return { finished, url, token, callback };
};

afterEach(() => {
	vi.mocked(open).mockClear();
});

describe('connectViaConsole', () => {
	// The query params are the contract with Console: it reads them to start the OAuth flow and to know
	// where to report back.
	it('opens the Console integrations page with the hand-off params', async () => {
		const { finished, url, token, callback } = await startConnect('gitlab', 'GitLab');

		expect(url.href).toContain('https://console.apify.com/settings/integrations');
		expect(url.searchParams.get('localCliCommand')).toBe('connect-git-provider');
		expect(url.searchParams.get('gitProvider')).toBe('gitlab');
		expect(url.searchParams.get('localCliApiVersion')).toBe('v1');
		expect(token).not.toBe('');

		await fetch(callback('exit'), { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
		await finished;
	});

	it('resolves connected when Console reports the provider is linked', async () => {
		const { finished, token, callback } = await startConnect('gitlab', 'GitLab');

		const response = await fetch(callback('git-provider-connected'), {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ integrationId: 'integration-1' }),
		});

		expect(response.ok).toBe(true);
		expect(await finished).toEqual({ connected: true });
	});

	it('reports a cancellation in Console as a stop, not a success', async () => {
		const { finished, token, callback } = await startConnect('bitbucket', 'Bitbucket');

		await fetch(callback('exit'), {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ actionCanceled: true }),
		});

		expect(await finished).toEqual({
			stopReason: 'connectCancelled',
			message: 'Connecting your Bitbucket account was canceled in Apify Console.',
		});
	});

	it('tells a closed Console window apart from an explicit cancel', async () => {
		const { finished, token, callback } = await startConnect('gitlab', 'GitLab');

		await fetch(callback('exit'), {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ isWindowClosed: true }),
		});

		expect(await finished).toEqual({
			stopReason: 'connectCancelled',
			message: 'Connecting your GitLab account stopped: the Apify Console window was closed.',
		});
	});

	it('gives up when the browser never reports back', async () => {
		vi.useFakeTimers();
		try {
			const finished = connectViaConsole('gitlab', 'GitLab');
			await vi.advanceTimersByTimeAsync(5 * 60_000);

			expect(await finished).toEqual({
				stopReason: 'connectTimedOut',
				message: 'Connecting your GitLab account did not finish within 5 minutes.',
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it('rejects a report that does not carry the token', async () => {
		const { finished, token, callback } = await startConnect('gitlab', 'GitLab');

		const response = await fetch(callback('git-provider-connected'), { method: 'POST' });
		expect(response.status).toBe(401);

		// The bad request must not have settled the hand-off.
		await fetch(callback('exit'), { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
		expect(await finished).toMatchObject({ stopReason: 'connectCancelled' });
	});
});
