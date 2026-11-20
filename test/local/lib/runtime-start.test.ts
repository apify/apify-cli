import { execa } from 'execa';

import { waitForRuntimeContainer } from '../../../src/lib/runtime/docker.js';

vi.mock('execa', () => ({ execa: vi.fn() }));

const ps = vi.mocked(execa);

const psPrinting = (...outputs: string[]) => {
	const queue = [...outputs];
	ps.mockImplementation((async () => ({ stdout: queue.length > 1 ? queue.shift()! : queue[0] })) as never);
};

describe('waitForRuntimeContainer()', () => {
	beforeEach(() => ps.mockReset());

	it('resolves once the engine lists the container as running', async () => {
		psPrinting('', '', 'apify-actor-runtime\n');

		await expect(waitForRuntimeContainer('docker', new AbortController().signal)).resolves.toBe(true);
		expect(ps).toHaveBeenCalledTimes(3);
	});

	it('gives up when the start fails before the container runs', async () => {
		psPrinting('');
		const startWatch = new AbortController();
		setTimeout(() => startWatch.abort(), 100);

		await expect(waitForRuntimeContainer('docker', startWatch.signal)).resolves.toBe(false);
	});

	it('gives up after the timeout', async () => {
		psPrinting('');

		await expect(waitForRuntimeContainer('podman', new AbortController().signal, 300)).resolves.toBe(false);
	});
});
