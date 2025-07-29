import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

import { USER_AGENT } from '../../entrypoints/_shared.js';
import { cliDebugPrint } from '../utils/cliDebugPrint.js';
import { useCLIMetadata } from './useCLIMetadata.js';

const metadata = useCLIMetadata();

function isInstalledOnMusl() {
	if (metadata.platform === 'linux') {
		return existsSync('/etc/alpine-release');
	}

	return false;
}

function isInstalledOnBaseline() {
	if (metadata.platform === 'darwin' && metadata.arch === 'x64') {
		const sysctlResult = execSync('sysctl -a', { encoding: 'utf-8' });

		return !sysctlResult.includes('AVX2');
	}

	if (metadata.platform === 'linux' && metadata.arch === 'x64') {
		const procCpuInfo = readFileSync('/proc/cpuinfo', 'utf-8');

		return !procCpuInfo.includes('avx2');
	}

	if (metadata.platform === 'windows') {
		// Windows ARM64 always needs baseline
		if (metadata.arch === 'arm64') {
			return true;
		}

		// Get AVX2 support like the install script does
		const isBaseline = execSync(
			"pwsh -c \"!(Add-Type -MemberDefinition '[DllImport(\\\"kernel32.dll\\\")] public static extern bool IsProcessorFeaturePresent(int ProcessorFeature);' -Name 'Kernel32' -Namespace 'Win32' -PassThru)::IsProcessorFeaturePresent(40)\"",
			{
				encoding: 'utf-8',
				windowsHide: true,
			},
		);

		return isBaseline.trim().toLowerCase() === 'true';
	}

	return false;
}

export interface Asset {
	name: string;
	browser_download_url: string;
}

/**
 * Fetches the assets for a given version of the CLI, matching the os and arch of the current machine.
 *
 * @param version - The version of the CLI to fetch the assets for.
 * @returns The assets for the given version of the CLI.
 */
export async function useCLIVersionAssets(version: string) {
	const versionWithoutV = version.replace(/^v(\d+)/, '$1');

	const tag = versionWithoutV === 'latest' ? 'latest' : `tags/v${versionWithoutV}`;

	const release = await fetch(`https://api.github.com/repos/apify/apify-cli/releases/${tag}`, {
		headers: {
			'User-Agent': USER_AGENT,
		},
	});

	if (!release.ok) {
		cliDebugPrint('useCLIVersionAssets', 'Failed to fetch release', {
			statusCode: release.status,
			body: await release.text(),
			version,
			tag,
		});

		return null;
	}

	const body = (await release.json()) as {
		assets: { name: string; browser_download_url: string }[];
		tag_name: string;
	};

	const requiresMusl = isInstalledOnMusl();
	const requiresBaseline = isInstalledOnBaseline();

	const assets = body.assets.filter((asset) => {
		const [
			//
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			_cliEntrypoint,
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			_version,
			assetOs,
			assetArch,
			assetBaselineOrMusl,
			assetBaseline,
		] = asset.name.replace(versionWithoutV, 'version').replace('.exe', '').split('-');

		if (assetOs !== metadata.platform) {
			return false;
		}

		if (assetArch !== metadata.arch) {
			return false;
		}

		if (requiresMusl) {
			return assetBaselineOrMusl === 'musl';
		}

		if (requiresBaseline) {
			return assetBaseline === 'baseline' || assetBaselineOrMusl === 'baseline';
		}

		return !assetBaselineOrMusl && !assetBaseline;
	});

	cliDebugPrint('useCLIVersionAssets', 'Fetched release', {
		version: body.tag_name,
		filteredAssets: assets,
	});

	return {
		assets,
		version: body.tag_name.replace(/^v(\d+)/, '$1'),
	};
}
