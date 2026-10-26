import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import process from 'node:process';

import { execa } from 'execa';

/** Where Linux distributions keep their combined CA bundle; the first one that exists is used. */
const LINUX_CA_BUNDLE_PATHS = [
	'/etc/ssl/certs/ca-certificates.crt', // Debian, Ubuntu, Alpine
	'/etc/pki/tls/certs/ca-bundle.crt', // RHEL, Fedora, CentOS
	'/etc/ssl/ca-bundle.pem', // openSUSE
	'/etc/ca-certificates/extracted/tls-ca-bundle.pem', // Arch
];

// Trusted roots and intermediates of the machine and the current user, as PEM. The "Disallowed" store is
// left out on purpose.
const WINDOWS_EXPORT_SCRIPT = `
$out = New-Object System.Text.StringBuilder
foreach ($store in 'Cert:\\LocalMachine\\Root', 'Cert:\\LocalMachine\\CA', 'Cert:\\CurrentUser\\Root', 'Cert:\\CurrentUser\\CA') {
  foreach ($cert in Get-ChildItem $store -ErrorAction SilentlyContinue) {
    $b64 = [Convert]::ToBase64String($cert.RawData, 'InsertLineBreaks')
    [void]$out.AppendLine('-----BEGIN CERTIFICATE-----')
    [void]$out.AppendLine($b64)
    [void]$out.AppendLine('-----END CERTIFICATE-----')
  }
}
$out.ToString()
`;

type RunCommand = (file: string, args: string[]) => Promise<string>;

const runCommand: RunCommand = async (file, args) => (await execa(file, args, { timeout: 30_000 })).stdout;

export interface HostCaOptions {
	platform?: NodeJS.Platform;
	exists?: (path: string) => boolean;
	readText?: (path: string) => Promise<string>;
	run?: RunCommand;
}

/**
 * The certificates the machine the CLI runs on trusts, as PEM: the OS trust store where it is a file
 * (Linux), or exported from it where it is not (the macOS keychains, the Windows certificate store).
 * Undefined when it cannot be read - the runtime then builds with the roots of its own image.
 */
export async function exportHostCaCertificates({
	platform = process.platform,
	exists = existsSync,
	readText = async (path) => await readFile(path, 'utf8'),
	run = runCommand,
}: HostCaOptions = {}): Promise<string | undefined> {
	try {
		if (platform === 'darwin') {
			return await run('security', [
				'find-certificate',
				'-a',
				'-p',
				'/Library/Keychains/System.keychain',
				`${process.env.HOME ?? ''}/Library/Keychains/login.keychain-db`,
			]);
		}
		if (platform === 'win32') {
			return await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_EXPORT_SCRIPT]);
		}
		const path = LINUX_CA_BUNDLE_PATHS.find((candidate) => exists(candidate));
		return path ? await readText(path) : undefined;
	} catch {
		return undefined;
	}
}

/** Where the exported certificates are written, to be mounted into the runtime container. */
export interface HostCaSources {
	/** `--ca-file`, or else the first standard CA environment variable naming an existing file. */
	extraCaFile?: string;
	hostStore: boolean;
}

/**
 * Writes the certificates for the runtime to `target` and returns it, or undefined when there are none:
 * the host's trust store (unless `hostStore` is off) followed by the extra file. The runtime keeps only
 * what its own roots lack, so a machine that trusts nothing special changes no build.
 */
export async function writeCaFileForRuntime(
	target: string,
	{ extraCaFile, hostStore }: HostCaSources,
	options: HostCaOptions = {},
): Promise<string | undefined> {
	const readText = options.readText ?? (async (path: string) => await readFile(path, 'utf8'));
	const parts: string[] = [];
	if (hostStore) {
		const host = await exportHostCaCertificates(options);
		if (host) parts.push(host);
	}
	if (extraCaFile) parts.push(await readText(extraCaFile));
	const pem = parts.join('\n').trim();
	if (!pem.includes('BEGIN CERTIFICATE')) return undefined;
	await mkdir(dirname(target), { recursive: true });
	await writeFile(target, `${pem}\n`);
	return target;
}
