import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { exportHostCaCertificates, writeCaFileForRuntime } from '../../../src/lib/runtime/host-ca.js';

const PEM = (name: string) => `-----BEGIN CERTIFICATE-----\n${name}\n-----END CERTIFICATE-----`;

describe('runtime/host-ca', () => {
	describe('exportHostCaCertificates()', () => {
		it('reads the first Linux bundle that exists', async () => {
			const readText = vi.fn(async (path: string) => `from ${path}`);
			const pem = await exportHostCaCertificates({
				platform: 'linux',
				exists: (path) => path === '/etc/pki/tls/certs/ca-bundle.crt',
				readText,
			});
			expect(pem).toBe('from /etc/pki/tls/certs/ca-bundle.crt');
		});

		it('is undefined on Linux when no known bundle exists', async () => {
			expect(await exportHostCaCertificates({ platform: 'linux', exists: () => false })).toBeUndefined();
		});

		it('exports the keychains on macOS', async () => {
			const run = vi.fn(async () => PEM('mac'));
			expect(await exportHostCaCertificates({ platform: 'darwin', run })).toBe(PEM('mac'));
			expect(run).toHaveBeenCalledWith('security', expect.arrayContaining(['find-certificate', '-a', '-p']));
		});

		it('exports the certificate stores through PowerShell on Windows', async () => {
			const run = vi.fn(async () => PEM('win'));
			expect(await exportHostCaCertificates({ platform: 'win32', run })).toBe(PEM('win'));
			expect(run.mock.calls[0]![0]).toBe('powershell');
		});

		it('is undefined when the export fails', async () => {
			const run = async () => {
				throw new Error('no keychain');
			};
			expect(await exportHostCaCertificates({ platform: 'darwin', run })).toBeUndefined();
		});
	});

	describe('writeCaFileForRuntime()', () => {
		let dir: string;
		beforeEach(async () => {
			dir = await mkdtemp(join(tmpdir(), 'host-ca-'));
		});
		afterEach(async () => {
			await rm(dir, { recursive: true, force: true });
		});

		it('writes the host certificates followed by the extra file', async () => {
			const target = join(dir, 'sub', 'host-ca.pem');
			const readText = async (path: string) => (path === '/extra.pem' ? PEM('extra') : '');
			const written = await writeCaFileForRuntime(
				target,
				{ extraCaFile: '/extra.pem', hostStore: true },
				{ platform: 'darwin', run: async () => PEM('host'), readText },
			);
			expect(written).toBe(target);
			const content = await readFile(target, 'utf8');
			expect(content.indexOf('host')).toBeLessThan(content.indexOf('extra'));
		});

		it('leaves the host store out when asked to', async () => {
			const run = vi.fn(async () => PEM('host'));
			const written = await writeCaFileForRuntime(
				join(dir, 'a.pem'),
				{ hostStore: false },
				{ platform: 'darwin', run },
			);
			expect(written).toBeUndefined();
			expect(run).not.toHaveBeenCalled();
		});

		it('writes nothing when there are no certificates at all', async () => {
			expect(
				await writeCaFileForRuntime(
					join(dir, 'a.pem'),
					{ hostStore: true },
					{ platform: 'linux', exists: () => false },
				),
			).toBeUndefined();
		});
	});
});
