import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import process from 'node:process';

const writeFile = vi.hoisted(() => vi.fn(async () => {}));
const spawn = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', async (importOriginal) => ({
	...(await importOriginal<typeof import('node:child_process')>()),
	spawn,
}));

vi.mock('node:fs/promises', async (importOriginal) => ({
	...(await importOriginal<typeof import('node:fs/promises')>()),
	readdir: vi.fn(async () => ['apify-cli.exe']),
	writeFile,
}));

vi.mock('../../../src/lib/hooks/useCLIMetadata.js', async (importOriginal) => {
	const original = await importOriginal<typeof import('../../../src/lib/hooks/useCLIMetadata.js')>();
	const metadata = { ...original.useCLIMetadata(), installMethod: 'bundle', platform: 'windows', arch: 'x64' };

	return { ...original, useCLIMetadata: () => metadata };
});

vi.mock('../../../src/lib/hooks/useCLIVersionAssets.js', () => ({
	useCLIVersionAssets: async () => ({
		version: '1.10.0',
		assets: [{ browser_download_url: 'https://example.com/apify-cli-1.10.0-windows-x64.exe' }],
	}),
}));

const { UpgradeCommand } = await import('../../../src/commands/cli-management/upgrade.js');
const { testRunCommand } = await import('../../../src/lib/command-framework/apify-command.js');

describe.runIf(process.platform === 'win32')('[windows] apify upgrade (bundle)', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', vi.fn());
		vi.stubGlobal('__APIFY_WINDOWS_UPGRADE_SCRIPT__', 'embedded script');
		// Never emits `spawn`, so the command doesn't `process.exit` the test runner.
		spawn.mockReset().mockReturnValue(new EventEmitter());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('runs the upgrade script embedded in the bundle, never a downloaded one', async () => {
		await testRunCommand(UpgradeCommand, { flags_version: '1.10.0' });

		expect(writeFile).toHaveBeenCalledWith(join(process.execPath, '..', 'upgrade.ps1'), 'embedded script');
		expect(fetch).not.toHaveBeenCalled();

		const system32 = join(process.env.SystemRoot!, 'System32').toLowerCase();
		const [command, args] = spawn.mock.calls[0]!;
		expect(command.toLowerCase()).toBe(join(system32, 'cmd.exe'));
		expect(args.at(-1).toLowerCase()).toContain(
			`""${join(system32, 'WindowsPowerShell', 'v1.0', 'powershell.exe').toLowerCase()}"`,
		);
	});
});
