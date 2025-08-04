import assert from 'node:assert';
import { existsSync } from 'node:fs';
import { mkdir, readFile, symlink, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { useCLIMetadata } from '../../lib/hooks/useCLIMetadata.js';
import { useYesNoConfirm } from '../../lib/hooks/user-confirmations/useYesNoConfirm.js';
import { info, simpleLog, success, warning } from '../../lib/outputs.js';
import { cliDebugPrint } from '../../lib/utils/cliDebugPrint.js';

const pathToInstallMarker = (installPath: string) => join(installPath, '.install-marker');

const tildify = (path: string) => {
	if (path.startsWith(process.env.HOME!)) {
		return path.replace(process.env.HOME!, '~');
	}

	return path;
};

export class InstallCommand extends ApifyCommand<typeof InstallCommand> {
	static override name = 'install' as const;

	static override description = 'Finalizes the first-time setup of Apify and Actor CLI.';

	static override hidden = true;

	async run() {
		const { installMethod, installPath, version } = useCLIMetadata();

		if (installMethod !== 'bundle') {
			info({ message: `Apify and Actor CLI are already fully configured! 👍 \n` });
			return;
		}

		assert(installPath, 'When CLI is installed via bundles, the install path must be set');

		const installMarkerPath = pathToInstallMarker(installPath);

		if (existsSync(installMarkerPath)) {
			info({ message: `Apify and Actor CLI are already fully configured! 👍 \n` });
			return;
		}

		await this.symlinkToLocalBin(installPath);

		await this.promptAddToShell();

		await writeFile(installMarkerPath, version);

		cliDebugPrint('[install] install marker written to', installMarkerPath);

		simpleLog({ message: '' });
		success({ message: 'To get started, run:' });
		simpleLog({ message: chalk.white.bold('  apify --help\n  actor --help') });
	}

	private async symlinkToLocalBin(installPath: string) {
		const userHomeDirectory = process.env.HOME;

		cliDebugPrint('[install] user home directory', userHomeDirectory);

		if (!userHomeDirectory) {
			cliDebugPrint('[install] user home directory not found');

			warning({ message: chalk.gray(`User home directory not found, cannot symlink to ~/.local/bin`) });

			return;
		}

		const localBinDirectory = join(userHomeDirectory, '.local', 'bin');

		// Make sure the directory exists
		if (!existsSync(localBinDirectory)) {
			await mkdir(localBinDirectory, { recursive: true });
		}

		const fileNames = ['apify', 'actor', 'apify-cli'];

		for (const file of fileNames) {
			const originalPath = join(installPath, file);

			if (!existsSync(originalPath)) {
				cliDebugPrint('[install] file not found for symlinking', file, originalPath);

				warning({ message: chalk.gray(`Bundle not found for symlinking: ${file}`) });
				continue;
			}

			const symlinkPath = join(localBinDirectory, file);

			await unlink(symlinkPath);
			await symlink(originalPath, symlinkPath);

			cliDebugPrint('[install] symlink created for item', file, symlinkPath);
		}

		info({ message: chalk.gray(`Symlinked apify, actor, and apify-cli to ${localBinDirectory}`) });
	}

	private async promptAddToShell() {
		const installDir = process.env.PROVIDED_INSTALL_DIR;

		if (!installDir) {
			warning({ message: chalk.gray(`Install directory not found, cannot add to shell`) });
			return;
		}

		const binDir = process.env.FINAL_BIN_DIR!;

		simpleLog({ message: '' });

		const allowedToAutomaticallyDo = await useYesNoConfirm({
			message:
				'Should the CLI handle adding itself to your shell automatically? (If you say no, you will receive the lines to add to your shell config file)',
			// For now, no stdin -> always false
			providedConfirmFromStdin: false,
		});

		const shell = basename(process.env.SHELL ?? 'sh');
		const quotedInstallDir = `"${installDir.replaceAll('"', '\\"')}"`;

		const linesToAdd = [];
		let configFile = '';

		switch (shell) {
			case 'bash': {
				linesToAdd.push(`export APIFY_CLI_INSTALL=${quotedInstallDir}`);
				linesToAdd.push(`export PATH="$APIFY_CLI_INSTALL/bin:$PATH"`);

				const configFiles = [join(process.env.HOME!, '.bashrc'), join(process.env.HOME!, '.bash_profile')];

				if (process.env.XDG_CONFIG_HOME) {
					configFiles.push(
						join(process.env.XDG_CONFIG_HOME, '.bashrc'),
						join(process.env.XDG_CONFIG_HOME, '.bash_profile'),
						join(process.env.XDG_CONFIG_HOME, 'bashrc'),
						join(process.env.XDG_CONFIG_HOME, 'bash_profile'),
					);
				}

				// Find the first likely match for the config file [because bash loves having a lot of alternatives]
				for (const maybeConfigFile of configFiles) {
					if (existsSync(maybeConfigFile)) {
						configFile = maybeConfigFile;
						break;
					}
				}

				break;
			}
			case 'zsh':
				linesToAdd.push(`export APIFY_CLI_INSTALL=${quotedInstallDir}`);
				linesToAdd.push(`export PATH="$APIFY_CLI_INSTALL/bin:$PATH"`);

				configFile = join(process.env.HOME!, '.zshrc');

				break;
			case 'fish': {
				linesToAdd.push(`set --export APIFY_CLI_INSTALL ${quotedInstallDir}`);
				linesToAdd.push(`set --export PATH ${binDir} $PATH`);

				configFile = join(process.env.HOME!, '.config', 'fish', 'config.fish');
				break;
			}
			default:
				linesToAdd.push(`export APIFY_CLI_INSTALL=${quotedInstallDir}`);
				linesToAdd.push(`export PATH="$APIFY_CLI_INSTALL/bin:$PATH"`);

				// We don't use a path as we don't know the shell
				configFile = '~/.bashrc';

				break;
		}

		simpleLog({ message: '' });

		if (allowedToAutomaticallyDo && configFile) {
			const oldContent = await readFile(configFile, 'utf-8');

			const newContent = `${oldContent}\n\n# apify cli\n${linesToAdd.join('\n')}`;

			await writeFile(configFile, newContent);

			info({ message: chalk.gray(`Added "${tildify(binDir)}" to $PATH in ${tildify(configFile)}`) });
		} else {
			info({
				message: [
					chalk.gray(
						`Manually add the following lines to your shell config file (${tildify(configFile)} or similar):`,
					),
					...linesToAdd.map((line) => chalk.white.bold(`  ${line}`)),
				].join('\n'),
			});
		}
	}
}
