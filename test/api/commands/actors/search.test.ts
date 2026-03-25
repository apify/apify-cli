import { ActorsSearchCommand } from '../../../../src/commands/actors/search.js';
import { testRunCommand } from '../../../../src/lib/command-framework/apify-command.js';
import { useConsoleSpy } from '../../../__setup__/hooks/useConsoleSpy.js';

const { logMessages, lastLogMessage } = useConsoleSpy();

describe('[api] apify actors search', () => {
	beforeEach(() => {
		process.exitCode = undefined;
	});

	it('should return results for a broad search query', async () => {
		await testRunCommand(ActorsSearchCommand, {
			args_query: 'web scraper',
		});

		expect(process.exitCode).toBeUndefined();

		const output = lastLogMessage();
		expect(output).toBeDefined();
		// Table output should contain the column headers
		expect(output).toContain('Name');
		expect(output).toContain('Pricing');
	});

	it('should show "no Actors found" for a nonsense query', async () => {
		await testRunCommand(ActorsSearchCommand, {
			args_query: 'xyznonexistentactor999888777',
		});

		expect(process.exitCode).toBeUndefined();

		const output = logMessages.log.join(' ');
		expect(output).toMatch(/no actors found/i);
	});

	it('should return JSON output when --json flag is used', async () => {
		await testRunCommand(ActorsSearchCommand, {
			args_query: 'web scraper',
			flags_json: true,
			flags_limit: 3,
		});

		expect(process.exitCode).toBeUndefined();

		const output = lastLogMessage();
		const parsed = JSON.parse(output);

		expect(parsed).toHaveProperty('total');
		expect(parsed).toHaveProperty('count');
		expect(parsed).toHaveProperty('items');
		expect(parsed.items.length).toBeLessThanOrEqual(3);

		// Each item should have basic Actor properties
		if (parsed.items.length > 0) {
			const item = parsed.items[0];
			expect(item).toHaveProperty('name');
			expect(item).toHaveProperty('username');
			expect(item).toHaveProperty('title');
		}
	});

	it('should respect the limit flag', async () => {
		await testRunCommand(ActorsSearchCommand, {
			args_query: 'scraper',
			flags_json: true,
			flags_limit: 2,
		});

		const parsed = JSON.parse(lastLogMessage());
		expect(parsed.items.length).toBeLessThanOrEqual(2);
	});

	it('should support pagination with offset', async () => {
		// Fetch first page
		await testRunCommand(ActorsSearchCommand, {
			args_query: 'scraper',
			flags_json: true,
			flags_limit: 2,
			flags_offset: 0,
		});
		const firstPage = JSON.parse(lastLogMessage());

		// Fetch second page
		await testRunCommand(ActorsSearchCommand, {
			args_query: 'scraper',
			flags_json: true,
			flags_limit: 2,
			flags_offset: 2,
		});
		const secondPage = JSON.parse(lastLogMessage());

		// Results should be different (different items)
		if (firstPage.items.length > 0 && secondPage.items.length > 0) {
			const firstPageNames = firstPage.items.map((i: { name: string }) => i.name);
			const secondPageNames = secondPage.items.map((i: { name: string }) => i.name);
			expect(firstPageNames).not.toEqual(secondPageNames);
		}
	});

	it('should filter by category', async () => {
		await testRunCommand(ActorsSearchCommand, {
			flags_json: true,
			flags_category: 'AI',
			flags_limit: 5,
		});

		expect(process.exitCode).toBeUndefined();

		const parsed = JSON.parse(lastLogMessage());
		expect(parsed).toHaveProperty('items');
	});

	it('should filter by pricing model', async () => {
		await testRunCommand(ActorsSearchCommand, {
			flags_json: true,
			flags_pricingModel: 'FREE',
			flags_limit: 5,
		});

		expect(process.exitCode).toBeUndefined();

		const parsed = JSON.parse(lastLogMessage());

		for (const item of parsed.items) {
			expect(item.currentPricingInfo?.pricingModel).toBe('FREE');
		}
	});

	it('should filter by username', async () => {
		await testRunCommand(ActorsSearchCommand, {
			flags_json: true,
			flags_username: 'apify',
			flags_limit: 5,
		});

		expect(process.exitCode).toBeUndefined();

		const parsed = JSON.parse(lastLogMessage());

		for (const item of parsed.items) {
			expect(item.username).toBe('apify');
		}
	});

	it('should accept sort-by flag without errors', async () => {
		await testRunCommand(ActorsSearchCommand, {
			flags_json: true,
			flags_sortBy: 'newest',
			flags_limit: 5,
		});

		expect(process.exitCode).toBeUndefined();

		const parsed = JSON.parse(lastLogMessage());
		expect(parsed.items.length).toBeGreaterThan(0);
	});

	it('should work without any query (browse all)', async () => {
		await testRunCommand(ActorsSearchCommand, {
			flags_json: true,
			flags_limit: 3,
		});

		expect(process.exitCode).toBeUndefined();

		const parsed = JSON.parse(lastLogMessage());
		expect(parsed.items.length).toBeGreaterThan(0);
	});

	it('should combine multiple filters', async () => {
		await testRunCommand(ActorsSearchCommand, {
			flags_json: true,
			flags_username: 'apify',
			flags_pricingModel: 'FREE',
			flags_limit: 5,
		});

		expect(process.exitCode).toBeUndefined();

		const parsed = JSON.parse(lastLogMessage());

		for (const item of parsed.items) {
			expect(item.username).toBe('apify');
			expect(item.currentPricingInfo?.pricingModel).toBe('FREE');
		}
	});

	it('should return valid JSON structure with total and offset in JSON mode', async () => {
		await testRunCommand(ActorsSearchCommand, {
			args_query: 'scraper',
			flags_json: true,
			flags_limit: 1,
			flags_offset: 5,
		});

		const parsed = JSON.parse(lastLogMessage());
		expect(parsed.total).toBeGreaterThan(0);
		expect(parsed.offset).toBe(5);
		expect(parsed.count).toBeGreaterThan(0);
	});
});
