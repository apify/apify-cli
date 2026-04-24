import { runCli } from '../../__helpers__/run-cli.js';

describe.concurrent('[e2e] actors search', () => {
	it('finds actors by query', async () => {
		const result = await runCli('apify', ['actors', 'search', 'web scraper', '--json']);

		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		const data = JSON.parse(result.stdout);
		expect(data.items.length).toBeGreaterThan(0);
	});

	it('respects --limit flag', async () => {
		const result = await runCli('apify', ['actors', 'search', 'scraper', '--limit', '3', '--json']);

		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		const data = JSON.parse(result.stdout);
		expect(data.items.length).toBeLessThanOrEqual(3);
	});

	it('filters by pricing model', async () => {
		const result = await runCli('apify', ['actors', 'search', '--pricing-model', 'FREE', '--limit', '5', '--json']);

		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		const data = JSON.parse(result.stdout);
		expect(data.items.length).toBeLessThanOrEqual(5);
	});

	it('returns empty results for nonexistent query', async () => {
		const result = await runCli('apify', ['actors', 'search', 'xyznonexistent12345absolutelyfake', '--json']);

		expect(result.exitCode, `stderr: ${result.stderr}`).toBe(0);
		const data = JSON.parse(result.stdout);
		expect(data.items.length).toBe(0);
	});
});
