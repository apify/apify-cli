import { ACTOR_JOB_STATUSES } from '@apify/consts';

import { outputJobLog } from '../../../src/lib/utils.js';

const runningJob = { id: 'job-id', status: ACTOR_JOB_STATUSES.RUNNING } as never;

function clientReturning(stream: ReadableStream<Uint8Array> | undefined) {
	return { log: () => ({ stream: async () => stream }) } as never;
}

describe('outputJobLog', () => {
	it('returns no-logs when the job has no log stream', async () => {
		await expect(outputJobLog({ job: runningJob, apifyClient: clientReturning(undefined) })).resolves.toBe('no-logs');
	});

	it('resolves when the stream closes', async () => {
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				setTimeout(() => controller.close(), 10);
			},
		});

		await expect(outputJobLog({ job: runningJob, apifyClient: clientReturning(stream) })).resolves.toBe('finished');
	});

	it('rejects when the stream errors', async () => {
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				setTimeout(() => controller.error(new Error('socket hang up')), 10);
			},
		});

		await expect(outputJobLog({ job: runningJob, apifyClient: clientReturning(stream) })).rejects.toThrow(
			'socket hang up',
		);
	});

	it('returns timeouts when the budget elapses first', async () => {
		const stream = new ReadableStream<Uint8Array>();

		await expect(
			outputJobLog({ job: runningJob, apifyClient: clientReturning(stream), timeoutMillis: 10 }),
		).resolves.toBe('timeouts');
	});
});
