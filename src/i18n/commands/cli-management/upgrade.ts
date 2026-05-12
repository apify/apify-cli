import { defineMessages } from '../../../lib/i18n/index.js';

export const UpgradeCommandMessages = defineMessages({
	en: {
		upToDate: {
			markdown: '{cliName} is up to date 👍 \n',
			json: () => null,
		},
		oldVersionWarning: {
			markdown: (md, colors) =>
				md(
					`You are using an old version of {cliName}. We strongly recommend you always use the latest available version.\n       ↪ Run ${colors.bgWhite(colors.black('{updateCommand}'))} to update! 👍 \n`,
				),
			json: () => null,
		},
		minimumVersion: {
			markdown: 'The minimum version of the CLI you can manually downgrade/upgrade to is {minVersion}.',
			json: () => null,
		},
		versionNotFound: {
			markdown: 'The provided version does not exist. Please check the version number and try again.',
			json: () => null,
		},
		assetsNotFound: {
			markdown:
				'Failed to find the assets for your system and the provided version. Please open an issue on https://github.com/apify/apify-cli/issues/new and provide the following information:\n- The version you are trying to upgrade to: {version}\n- The system you are running on: {platform} {arch}',
			json: () => null,
		},
		bundleNotFound: {
			markdown:
				'Failed to find the currently installed {cliName} bundle. Please open an issue on https://github.com/apify/apify-cli/issues/new and provide the following information:\n- The version you are trying to upgrade to: {version}\n- The system you are running on: {platform} {arch}\n- The directory where the {cliName} bundle is installed: {bundleDirectory}',
			json: () => null,
		},
		wouldRunCommand: {
			markdown: 'Would run command: {updateCommand}',
			json: () => null,
		},
		upgradeFailed: {
			markdown: 'Failed to upgrade the CLI. Please run the following command manually: {updateCommand}',
			json: () => null,
		},
		successfullyUpgraded: {
			markdown: 'Successfully upgraded to {version} 👍',
			json: () => null,
		},
		startingUpgradeProcess: {
			markdown: 'Starting upgrade process...',
			json: () => null,
		},
		failedToStartUpgrade: {
			markdown: 'Failed to start the upgrade process: {message}',
			json: () => null,
		},
		fetchScriptFailed: {
			markdown:
				'Failed to fetch the upgrade script. Please open an issue on https://github.com/apify/apify-cli/issues/new and provide the following information:\n- The system you are running on: {platform} {arch}\n- The URL of the asset that failed to fetch: {url}\n- The status code of the response: {status,number}',
			json: () => null,
		},
		downloadingBinary: {
			markdown: 'Downloading `{cliName}` binary of the Apify CLI...',
			json: () => null,
		},
		fetchAssetFailed: {
			markdown:
				'Failed to fetch the {cliName} bundle. Please open an issue on https://github.com/apify/apify-cli/issues/new and provide the following information:\n- The version you are trying to upgrade to: {version}\n- The system you are running on: {platform} {arch}\n- The URL of the asset that failed to fetch: {url}\n- The status code of the response: {status,number}\n- The body of the response: {body}',
			json: () => null,
		},
		wouldWriteAsset: {
			markdown: 'Would write asset {cliName} to {filePath}',
			json: () => null,
		},
		writingAsset: {
			markdown: (md, colors) => md(colors.gray('Writing {cliName} to {filePath}...')),
			json: () => null,
		},
		writeAssetFailed: {
			markdown:
				'Failed to write the {cliName} bundle. Please open an issue on https://github.com/apify/apify-cli/issues/new and provide the following information:\n- The version you are trying to upgrade to: {version}\n- The system you are running on: {platform} {arch}\n- The URL of the asset that failed to fetch: {url}\n- The error: {message}',
			json: () => null,
		},
	},
});
