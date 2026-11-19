import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import process from 'node:process';

import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';

const fsMocks = vi.hoisted(() => ({
	rename: vi.fn<(from: string, to: string) => Promise<void>>(),
	writeFile: vi.fn(async () => {}),
}));

const spawn = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', async (importOriginal) => ({
	...(await importOriginal<typeof import('node:child_process')>()),
	spawn,
}));

vi.mock('node:fs/promises', async (importOriginal) => ({
	...(await importOriginal<typeof import('node:fs/promises')>()),
	readdir: vi.fn(async () => ['apify-cli']),
	writeFile: fsMocks.writeFile,
	rename: fsMocks.rename,
	rm: vi.fn(async () => {}),
}));

vi.mock('../../../src/lib/bundleMigration.js', () => ({ writeEntrypointShims: vi.fn() }));

const metadata = vi.hoisted(() => ({ platform: 'linux' }));

vi.mock('../../../src/lib/hooks/useCLIMetadata.js', async (importOriginal) => {
	const original = await importOriginal<typeof import('../../../src/lib/hooks/useCLIMetadata.js')>();
	Object.assign(metadata, original.useCLIMetadata(), { installMethod: 'bundle', platform: 'linux', arch: 'x64' });

	return { ...original, useCLIMetadata: () => metadata };
});

vi.mock('../../../src/lib/hooks/useCLIVersionAssets.js', () => ({
	useCLIVersionAssets: async () => ({
		version: '1.10.0',
		assets: [{ browser_download_url: 'https://example.com/apify-cli-1.10.0-linux-x64' }],
	}),
}));

const { logMessages } = useConsoleSpy();

const { UpgradeCommand } = await import('../../../src/commands/cli-management/upgrade.js');
const { testRunCommand } = await import('../../../src/lib/command-framework/apify-command.js');

const allOutput = () => [...logMessages.log, ...logMessages.error].join('\n');

describe('apify upgrade (bundle, unix)', () => {
	beforeEach(() => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })),
		);
		fsMocks.rename.mockReset().mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		process.exitCode = undefined;
	});

	it('reports success when the binary is replaced', async () => {
		await testRunCommand(UpgradeCommand, { flags_version: '1.10.0' });

		expect(allOutput()).toMatch(/Successfully upgraded to 1\.10\.0/);
		expect(process.exitCode).toBeFalsy();
	});

	it('does not report success and exits non-zero when writing the binary fails', async () => {
		fsMocks.rename.mockRejectedValue(
			Object.assign(new Error("ETXTBSY: text file is busy, open 'apify-cli'"), { code: 'ETXTBSY' }),
		);

		await testRunCommand(UpgradeCommand, { flags_version: '1.10.0' });

		expect(allOutput()).toMatch(/Failed to write the apify-cli bundle/);
		expect(allOutput()).not.toMatch(/Successfully upgraded/);
		expect(process.exitCode).toBe(1);
	});

	it('does not report success and exits non-zero when downloading the binary fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('not found', { status: 404 })),
		);

		await testRunCommand(UpgradeCommand, { flags_version: '1.10.0' });

		expect(allOutput()).toMatch(/Failed to fetch the apify-cli bundle/);
		expect(allOutput()).not.toMatch(/Successfully upgraded/);
		expect(process.exitCode).toBe(1);
	});
});

describe('apify upgrade (bundle, windows)', () => {
	beforeEach(() => {
		metadata.platform = 'windows';
		vi.stubGlobal('fetch', vi.fn());
		vi.stubGlobal('__APIFY_WINDOWS_UPGRADE_SCRIPT__', 'embedded script');
		// Never emits `spawn`, so the command doesn't `process.exit` the test runner.
		spawn.mockReset().mockReturnValue(new EventEmitter());
	});

	afterEach(() => {
		metadata.platform = 'linux';
		vi.unstubAllGlobals();
	});

	it('runs the upgrade script embedded in the bundle, never a downloaded one', async () => {
		await testRunCommand(UpgradeCommand, { flags_version: '1.10.0' });

		const scriptPath = join(process.execPath, '..', 'upgrade.ps1');
		expect(fsMocks.writeFile).toHaveBeenCalledWith(scriptPath, 'embedded script');
		expect(fetch).not.toHaveBeenCalled();

		const [command, args] = spawn.mock.calls[0]!;
		expect(command).toMatch(/[\\/]System32[\\/]cmd\.exe$/);
		expect(args.at(-1)).toMatch(/^""[^"]*[\\/]System32[\\/]WindowsPowerShell[\\/]v1\.0[\\/]powershell\.exe"/);
	});
});
