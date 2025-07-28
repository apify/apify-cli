import assert from 'node:assert';
import { existsSync } from 'node:fs';
import { mkdir, readFile, symlink, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { useCLIMetadata } from '../../lib/hooks/useCLIMetadata.js';
import { info, simpleLog, success, warning } from '../../lib/outputs.js';
import { cliDebugPrint } from '../../lib/utils/cliDebugPrint.js';
import { confirmAction } from '../../lib/utils/confirm.js';

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
		const { installMethod, installPath } = useCLIMetadata();

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

		await writeFile(installMarkerPath, '');

		cliDebugPrint('[install] install marker written to', installMarkerPath);

		simpleLog({ message: '' });
		success({ message: 'To get started, run:' });
		simpleLog({ message: chalk.white.bold('  apify --help\n  actor --help') });

		/*
case $(basename "$SHELL") in
bash)
    commands=(
        "export $install_env=$quoted_install_dir"
        "export PATH=\"$bin_env:\$PATH\""
    )

    bash_configs=(
        "$HOME/.bashrc"
        "$HOME/.bash_profile"
    )

    if [[ ${XDG_CONFIG_HOME:-} ]]; then
        bash_configs+=(
            "$XDG_CONFIG_HOME/.bash_profile"
            "$XDG_CONFIG_HOME/.bashrc"
            "$XDG_CONFIG_HOME/bash_profile"
            "$XDG_CONFIG_HOME/bashrc"
        )
    fi

    set_manually=true
    for bash_config in "${bash_configs[@]}"; do
        tilde_bash_config=$(tildify "$bash_config")

        if [[ -w $bash_config ]]; then
            {
                echo -e '\n# apify cli'

                for command in "${commands[@]}"; do
                    echo "$command"
                done
            } >>"$bash_config"

            info "Added \"$tilde_bin_dir\" to \$PATH in \"$tilde_bash_config\""

            refresh_command="source $bash_config"
            set_manually=false
            break
        fi
    done

    if [[ $set_manually = true ]]; then
        echo "Manually add the directory to $tilde_bash_config (or similar):"

        for command in "${commands[@]}"; do
            info_bold "  $command"
        done
    fi
    ;;
*)
    echo 'Manually add the directory to ~/.bashrc (or similar):'
    info_bold "  export $install_env=$quoted_install_dir"
    info_bold "  export PATH=\"$bin_env:\$PATH\""
    ;;
esac

echo
info "To get started, run:"
echo

if [[ $refresh_command ]]; then
    info_bold "  $refresh_command $(info "(if the shell is not automatically refreshed)")"
fi

info_bold "  apify --help"
echo
		*/
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

		const allowedToAutomaticallyDo = await confirmAction({
			type: 'boolean',
			message:
				'Should the CLI handle adding itself to your shell automatically? (If you say no, you will receive the lines to add to your shell config file)',
		});

		const shell = basename(process.env.SHELL ?? 'sh');
		const quotedInstallDir = `"${installDir.replaceAll('"', '\\"')}"`;

		const linesToAdd = [];
		let configFile = '';

		switch (shell) {
			case 'bash':
				break;
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
