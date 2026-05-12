import { defineMessages } from '../../../lib/i18n/index.js';

export const InstallCommandMessages = defineMessages({
	en: {
		alreadyConfigured: {
			markdown: 'Apify and Actor CLI are already fully configured! 👍',
			json: () => null,
		},
		shellIntegrationFailedFallback: {
			markdown: 'Failed to automatically handle shell integration',
			json: () => null,
		},
		shellIntegrationFailed: {
			markdown: '{message}',
			json: () => null,
		},
		installSuccessMessage: {
			markdown: (md, colors) =>
				md(
					`\n${colors.green('Apify and Actor CLI were installed successfully!')}\n\n${colors.gray(`  Version: ${colors.green('{version}')}`)}\n${colors.gray(`  Location: ${colors.bold.white('{apifyLocation}')} and ${colors.bold.white('{actorLocation}')}`)}`,
				),
			json: () => null,
		},
		toGetStarted: {
			markdown: 'To get started, run:',
			json: () => null,
		},
		helpCommands: {
			markdown: (md, colors) => md(colors.white.bold('  apify --help\n  actor --help')),
			json: () => null,
		},
		homeDirNotFound: {
			markdown: (md, colors) => md(colors.gray('User home directory not found, cannot symlink to ~/.local/bin')),
			json: () => null,
		},
		bundleNotFoundForSymlinking: {
			markdown: (md, colors) => md(colors.gray('Bundle not found for symlinking: {file}')),
			json: () => null,
		},
		symlinkedToLocalBin: {
			markdown: (md, colors) => md(colors.gray('Symlinked apify, actor, and apify-cli to {localBinDirectory}')),
			json: () => null,
		},
		alreadyInPath: {
			markdown: (md, colors) => md(colors.gray('Apify and Actor CLIs are already in PATH, skipping shell integration')),
			json: () => null,
		},
		installDirNotFound: {
			markdown: (md, colors) => md(colors.gray('Install directory not found, cannot add to shell')),
			json: () => null,
		},
		readConfigFailed: {
			markdown: 'Failed to read config file "{configFile}". Received error code: {code}; {message}',
			json: () => null,
		},
		writeConfigPermissionDenied: {
			markdown: 'Failed to write to config file "{configFile}", as the CLI does not have permission to write to it.',
			json: () => null,
		},
		writeConfigFailed: {
			markdown: 'Failed to write to config file "{configFile}". Received error code: {code}; {message}',
			json: () => null,
		},
		pathAddedSuccess: {
			markdown: (md, colors) =>
				md(
					`${colors.gray('Added "{binDir}" to your PATH in {configFile}.')}\n${colors.gray(`  You may need to run ${colors.white.bold('source {configFile}')} to reload your shell.`)}`,
				),
			json: () => null,
		},
		notInPathOneLiner: {
			markdown: (md, colors) =>
				md(
					`${colors.gray('The Apify & Actor CLIs are not in your PATH. Run:')}\n\n${colors.white.bold('  {oneLiner}')}`,
				),
			json: () => null,
		},
		manuallyAdd: {
			markdown: (md, colors) =>
				md(`${colors.gray('Manually add the following lines to {configFile} or similar:')}\n{linesToAdd}`),
			json: () => null,
		},
	},
});
