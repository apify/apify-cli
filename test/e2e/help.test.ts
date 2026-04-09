import { runCli } from './__helpers__/run-cli.js';

describe.concurrent('[e2e] help command', () => {
	it('apify help prints the full help message', async () => {
		const result = await runCli('apify', ['help']);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('https://apify.com/contact');
	});

	it('actor help prints the full help message', async () => {
		const result = await runCli('actor', ['help']);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('https://apify.com/contact');
	});

	it('apify help help prints the full help message', async () => {
		const result = await runCli('apify', ['help', 'help']);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('https://apify.com/contact');
	});

	it('apify help -h prints help for the help command', async () => {
		const result = await runCli('apify', ['help', '-h']);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('Prints out help about a command, or all available commands.');
	});

	it('apify help run prints run command description', async () => {
		const result = await runCli('apify', ['help', 'run']);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('Executes Actor locally with simulated Apify environment variables.');
	});

	it('apify run --help prints the same as apify help run', async () => {
		const result = await runCli('apify', ['run', '--help']);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('Executes Actor locally with simulated Apify environment variables.');
	});
});
