import assert from 'node:assert';
import { existsSync, openSync } from 'node:fs';
import { mkdir, readFile, symlink, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { ReadStream } from 'node:tty';

import chalk from 'chalk';
import which from 'which';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { useCLIMetadata } from '../../lib/hooks/useCLIMetadata.js';
import { useYesNoConfirm } from '../../lib/hooks/user-confirmations/useYesNoConfirm.js';
import { logger } from '../../lib/logger.js';
import { detectShell, shellConfigFile, tildify } from '../../lib/utils.js';

import { InstallCommandMessages } from '#i18n/commands/cli-management/install.js';

const pathToInstallMarker = (installPath: string) => join(installPath, '.install-marker');
const HOMEDIR = () => process.env.HOME ?? homedir();

export class InstallCommand extends ApifyCommand<typeof InstallCommand> {
	static override name = 'install' as const;

	static override description = 'Finalizes the first-time setup of Apify and Actor CLI.';

	static override hidden = true;

	async run() {
		const { installMethod, installPath, version } = useCLIMetadata();

		if (installMethod !== 'bundle') {
			this.logger.stderr.info(this.t(InstallCommandMessages.alreadyConfigured));
			return;
		}

		assert(installPath, 'When CLI is installed via bundles, the install path must be set');

		const installMarkerPath = pathToInstallMarker(installPath);

		if (existsSync(installMarkerPath)) {
			this.logger.stderr.info(this.t(InstallCommandMessages.alreadyConfigured));
			return;
		}

		if (process.platform !== 'win32') {
			await this.symlinkToLocalBin(installPath);

			// We don't want any errors bubbled up to prevent the command from finalizing
			try {
				await this.promptAddToShell();
			} catch (err: any) {
				this.logger.stderr.error(
					err.message
						? this.t(InstallCommandMessages.shellIntegrationFailed, { message: err.message })
						: this.t(InstallCommandMessages.shellIntegrationFailedFallback),
				);
			}

			this.logger.stderr.log('');
		}

		await writeFile(installMarkerPath, version);

		logger.debug('[install] install marker written to', installMarkerPath);

		this.logger.stderr.log(
			this.t(InstallCommandMessages.installSuccessMessage, {
				version,
				apifyLocation: tildify(join(installPath, 'apify')),
				actorLocation: tildify(join(installPath, 'actor')),
			}),
		);

		this.logger.stderr.log('');
		this.logger.stderr.success(this.t(InstallCommandMessages.toGetStarted));
		this.logger.stderr.log(this.t(InstallCommandMessages.helpCommands));
	}

	private async symlinkToLocalBin(installPath: string) {
		const userHomeDirectory = HOMEDIR();

		logger.debug('[install -> symlinkToLocalBin] user home directory', userHomeDirectory);

		if (!userHomeDirectory) {
			logger.debug('[install -> symlinkToLocalBin] user home directory not found');

			this.logger.stderr.warning(this.t(InstallCommandMessages.homeDirNotFound));

			return;
		}

		const localBinDirectory = join(userHomeDirectory, '.local', 'bin');

		// Make sure the directory exists
		await mkdir(localBinDirectory, { recursive: true });

		const fileNames = ['apify', 'actor', 'apify-cli'];

		for (const file of fileNames) {
			const originalPath = join(installPath, file);

			if (!existsSync(originalPath)) {
				logger.debug('[install] file not found for symlinking', file, originalPath);

				this.logger.stderr.warning(this.t(InstallCommandMessages.bundleNotFoundForSymlinking, { file }));
				continue;
			}

			const symlinkPath = join(localBinDirectory, file);

			await unlink(symlinkPath).catch(() => {
				// Ignore errors
			});

			await symlink(originalPath, symlinkPath);

			logger.debug('[install] symlink created for item', file, symlinkPath);
		}

		this.logger.stderr.info(
			this.t(InstallCommandMessages.symlinkedToLocalBin, { localBinDirectory: tildify(localBinDirectory) }),
		);
	}

	/**
	 * Prompt using /dev/tty directly, bypassing Inquirer (whose internal readline
	 * cannot be closed and hangs the process when given a custom input stream).
	 */
	private async confirmFromTty(message: string): Promise<boolean> {
		let fd: number | undefined;
		let ttyStream: ReadStream | undefined;

		const prompt = `${chalk.green('?')} ${chalk.bold(message)} ${chalk.dim('(Y/n)')} `;

		const writeDone = (answer: string) => {
			// Clear the current line and rewrite with the final answer, like Inquirer does
			process.stdout.write(`\r\x1b[2K${chalk.green('?')} ${chalk.bold(message)} ${chalk.cyan(answer)}\n`);
		};

		try {
			logger.debug('[install] opening /dev/tty for raw mode');
			fd = openSync('/dev/tty', 'r');
			ttyStream = new ReadStream(fd);

			process.stdout.write(prompt);

			ttyStream.setRawMode(true);
			ttyStream.resume();

			const result = await new Promise<boolean>((resolve) => {
				const onData = (data: Buffer) => {
					const key = data.toString();

					if (key === 'y' || key === 'Y' || key === '\r' || key === '\n') {
						ttyStream!.removeListener('data', onData);
						writeDone('Yes');
						resolve(true);
					} else if (key === 'n' || key === 'N') {
						ttyStream!.removeListener('data', onData);
						writeDone('No');
						resolve(false);
					} else if (key === '\u0003' || key === '\u0004') {
						// Ctrl+C or Ctrl+D
						ttyStream!.removeListener('data', onData);
						process.stdout.write('\n');
						resolve(false);
					}
				};

				ttyStream!.on('data', onData);
			});

			return result;
		} catch (err) {
			logger.debug('[install] failed to open /dev/tty for raw mode', err);
			return false;
		} finally {
			if (ttyStream) {
				ttyStream.setRawMode(false);
				ttyStream.pause();
				ttyStream.destroy();
			}

			// Keeping this code here if we will need it again,
			// but it looks like in Bun it automatically closes the file descriptor [possibly ttyStream.destroy() does this]

			// if (fd !== undefined) {
			// 	try {
			// 		closeSync(fd);
			// 	} catch {
			// 		// Like in C, if close fails, tough luck
			// 	}
			// }
		}
	}

	private async promptAddToShell() {
		// Check if we can already resolve the CLI from PATH
		const [apifyCliPath, actorCliPath] = await Promise.allSettled([
			which('apify', { nothrow: true }),
			which('actor', { nothrow: true }),
		]);

		if (
			apifyCliPath.status === 'fulfilled' &&
			actorCliPath.status === 'fulfilled' &&
			apifyCliPath.value &&
			actorCliPath.value
		) {
			logger.debug('[install -> promptAddToShell] already in PATH', { apifyCliPath, actorCliPath });

			this.logger.stderr.info(this.t(InstallCommandMessages.alreadyInPath));
			return;
		}

		const userHomeDirectory = HOMEDIR();

		logger.debug('[install -> promptAddToShell] user home directory', userHomeDirectory);

		const defaultInstallDir = process.env.APIFY_CLI_INSTALL ?? join(userHomeDirectory, '.apify');
		const defaultBinDir = process.env.FINAL_BIN_DIR ?? join(defaultInstallDir, 'bin');
		const installDir = process.env.PROVIDED_INSTALL_DIR ?? defaultInstallDir;

		if (!installDir) {
			this.logger.stderr.warning(this.t(InstallCommandMessages.installDirNotFound));
			return;
		}

		const binDir = process.env.FINAL_BIN_DIR ?? defaultBinDir;

		this.logger.stderr.log('');

		const confirmMessage = 'Should the CLI handle adding itself to your shell automatically?';

		let allowedToAutomaticallyDo: boolean;

		if (process.env.APIFY_OPEN_TTY) {
			// When running via `curl | bash`, Inquirer's readline interface cannot be
			// properly cleaned up (it never closes), which hangs the process.
			// Instead, we open /dev/tty directly and read a single keypress ourselves.
			allowedToAutomaticallyDo = await this.confirmFromTty(confirmMessage);
		} else {
			logger.debug('[install] opening /dev/tty for raw mode not requested, falling back to normal flow');
			allowedToAutomaticallyDo = await useYesNoConfirm({
				message: confirmMessage,
				// For now, no stdin -> always false
				providedConfirmFromStdin: false,
			});
		}

		const shell = detectShell();
		const configFile = shellConfigFile(userHomeDirectory, shell);
		const quotedInstallDir = `"${installDir.replaceAll('"', '\\"')}"`;

		const linesToAdd = [];
		let showOneLiner = true;

		switch (shell) {
			case 'bash':
			case 'zsh': {
				linesToAdd.push(`export APIFY_CLI_INSTALL=${quotedInstallDir}`);
				linesToAdd.push(`export PATH="$APIFY_CLI_INSTALL/bin:$PATH"`);

				break;
			}
			case 'fish': {
				linesToAdd.push(`set --export APIFY_CLI_INSTALL ${quotedInstallDir}`);
				linesToAdd.push(`set --export PATH ${binDir} $PATH`);

				break;
			}
			default: {
				// We don't know the shell, so we just show it to the user
				linesToAdd.push(`export APIFY_CLI_INSTALL=${quotedInstallDir}`);
				linesToAdd.push(`export PATH="$APIFY_CLI_INSTALL/bin:$PATH"`);

				// Never automatically add to the file as we don't know the shell
				allowedToAutomaticallyDo = false;
				// And don't show the one-liner because we don't know the shell
				showOneLiner = false;

				break;
			}
		}

		this.logger.stderr.log('');

		if (allowedToAutomaticallyDo && configFile) {
			const oldContent = await readFile(configFile, 'utf-8').catch((err) => {
				if (err.code === 'ENOENT') {
					// File doesn't exist, that's fine
					return '';
				}

				throw new Error(
					this.t(InstallCommandMessages.readConfigFailed, {
						configFile: tildify(configFile),
						code: err.code,
						message: err.message,
					}),
				);
			});

			const newContent = `${oldContent}\n\n# apify cli\n${linesToAdd.join('\n')}\n`;

			try {
				await mkdir(dirname(configFile), { recursive: true });
				await writeFile(configFile, newContent);
			} catch (err: any) {
				if (err.code === 'EACCES') {
					throw new Error(
						this.t(InstallCommandMessages.writeConfigPermissionDenied, { configFile: tildify(configFile) }),
					);
				}

				throw new Error(
					this.t(InstallCommandMessages.writeConfigFailed, {
						configFile: tildify(configFile),
						code: err.code,
						message: err.message,
					}),
				);
			}

			this.logger.stderr.info(
				this.t(InstallCommandMessages.pathAddedSuccess, {
					binDir: tildify(binDir),
					configFile: tildify(configFile),
				}),
			);

			return;
		}

		const resolvedConfigFile = configFile ?? 'your shell config file';

		if (showOneLiner) {
			const oneLiner = `echo -e '${linesToAdd.join('\\n')}' >> "${resolvedConfigFile}" && source "${resolvedConfigFile}"`;

			this.logger.stderr.info(this.t(InstallCommandMessages.notInPathOneLiner, { oneLiner }));

			return;
		}

		this.logger.stderr.info(
			this.t(InstallCommandMessages.manuallyAdd, {
				configFile: resolvedConfigFile,
				linesToAdd: linesToAdd.map((line) => chalk.white.bold(`  ${line}`)).join('\n'),
			}),
		);
	}
}
