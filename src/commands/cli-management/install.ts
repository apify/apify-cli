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
import { error, info, simpleLog, success, warning } from '../../lib/outputs.js';
import { detectShell, shellConfigFile, tildify } from '../../lib/utils.js';
import { cliDebugPrint } from '../../lib/utils/cliDebugPrint.js';

const pathToInstallMarker = (installPath: string) => join(installPath, '.install-marker');
const HOMEDIR = () => process.env.HOME ?? homedir();

export class InstallCommand extends ApifyCommand<typeof InstallCommand> {
	static override name = 'install' as const;

	static override description = 'Finalizes the first-time setup of Apify and Actor CLI.';

	static override hidden = true;

	async run() {
		const { installMethod, installPath, version } = useCLIMetadata();

		if (installMethod !== 'bundle') {
			info({ message: `Apify and Actor CLI are already fully configured! 👍` });
			return;
		}

		assert(installPath, 'When CLI is installed via bundles, the install path must be set');

		const installMarkerPath = pathToInstallMarker(installPath);

		if (existsSync(installMarkerPath)) {
			info({ message: `Apify and Actor CLI are already fully configured! 👍` });
			return;
		}

		if (process.platform !== 'win32') {
			await this.symlinkToLocalBin(installPath);

			// We don't want any errors bubbled up to prevent the command from finalizing
			try {
				await this.promptAddToShell();
			} catch (err: any) {
				error({ message: err.message || 'Failed to automatically handle shell integration' });
			}

			simpleLog({ message: '' });
		}

		await writeFile(installMarkerPath, version);

		cliDebugPrint('[install] install marker written to', installMarkerPath);

		simpleLog({
			message: [
				'',
				chalk.green('Apify and Actor CLI were installed successfully!'),
				'',
				chalk.gray(`  Version: ${chalk.green(version)}`),
				chalk.gray(
					`  Location: ${chalk.bold.white(tildify(join(installPath, 'apify')))} and ${chalk.bold.white(tildify(join(installPath, 'actor')))}`,
				),
			].join('\n'),
		});

		simpleLog({ message: '' });
		success({ message: 'To get started, run:' });
		simpleLog({ message: chalk.white.bold('  apify --help\n  actor --help') });
	}

	private async symlinkToLocalBin(installPath: string) {
		const userHomeDirectory = HOMEDIR();

		cliDebugPrint('[install -> symlinkToLocalBin] user home directory', userHomeDirectory);

		if (!userHomeDirectory) {
			cliDebugPrint('[install -> symlinkToLocalBin] user home directory not found');

			warning({ message: chalk.gray(`User home directory not found, cannot symlink to ~/.local/bin`) });

			return;
		}

		const localBinDirectory = join(userHomeDirectory, '.local', 'bin');

		// Make sure the directory exists
		await mkdir(localBinDirectory, { recursive: true });

		const fileNames = ['apify', 'actor', 'apify-cli'];

		for (const file of fileNames) {
			const originalPath = join(installPath, file);

			if (!existsSync(originalPath)) {
				cliDebugPrint('[install] file not found for symlinking', file, originalPath);

				warning({ message: chalk.gray(`Bundle not found for symlinking: ${file}`) });
				continue;
			}

			const symlinkPath = join(localBinDirectory, file);

			await unlink(symlinkPath).catch(() => {
				// Ignore errors
			});

			await symlink(originalPath, symlinkPath);

			cliDebugPrint('[install] symlink created for item', file, symlinkPath);
		}

		info({ message: chalk.gray(`Symlinked apify, actor, and apify-cli to ${tildify(localBinDirectory)}`) });
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
			cliDebugPrint('[install] opening /dev/tty for raw mode');
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
			cliDebugPrint('[install] failed to open /dev/tty for raw mode', err);
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
			cliDebugPrint('[install -> promptAddToShell] already in PATH', { apifyCliPath, actorCliPath });

			info({ message: chalk.gray(`Apify and Actor CLIs are already in PATH, skipping shell integration`) });
			return;
		}

		const userHomeDirectory = HOMEDIR();

		cliDebugPrint('[install -> promptAddToShell] user home directory', userHomeDirectory);

		const defaultInstallDir = process.env.APIFY_CLI_INSTALL ?? join(userHomeDirectory, '.apify');
		const defaultBinDir = process.env.FINAL_BIN_DIR ?? join(defaultInstallDir, 'bin');
		const installDir = process.env.PROVIDED_INSTALL_DIR ?? defaultInstallDir;

		if (!installDir) {
			warning({ message: chalk.gray(`Install directory not found, cannot add to shell`) });
			return;
		}

		const binDir = process.env.FINAL_BIN_DIR ?? defaultBinDir;

		simpleLog({ message: '' });

		const confirmMessage = 'Should the CLI handle adding itself to your shell automatically?';

		let allowedToAutomaticallyDo: boolean;

		if (process.env.APIFY_OPEN_TTY) {
			// When running via `curl | bash`, Inquirer's readline interface cannot be
			// properly cleaned up (it never closes), which hangs the process.
			// Instead, we open /dev/tty directly and read a single keypress ourselves.
			allowedToAutomaticallyDo = await this.confirmFromTty(confirmMessage);
		} else {
			cliDebugPrint('[install] opening /dev/tty for raw mode not requested, falling back to normal flow');
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

		simpleLog({ message: '' });

		if (allowedToAutomaticallyDo && configFile) {
			const oldContent = await readFile(configFile, 'utf-8').catch((err) => {
				if (err.code === 'ENOENT') {
					// File doesn't exist, that's fine
					return '';
				}

				throw new Error(
					`Failed to read config file "${tildify(configFile)}". Received error code: ${err.code}; ${err.message}`,
				);
			});

			const newContent = `${oldContent}\n\n# apify cli\n${linesToAdd.join('\n')}\n`;

			try {
				await mkdir(dirname(configFile), { recursive: true });
				await writeFile(configFile, newContent);
			} catch (err: any) {
				if (err.code === 'EACCES') {
					throw new Error(
						`Failed to write to config file "${tildify(configFile)}", as the CLI does not have permission to write to it.`,
					);
				}

				throw new Error(
					`Failed to write to config file "${tildify(configFile)}". Received error code: ${err.code}; ${err.message}`,
				);
			}

			info({
				message: [
					chalk.gray(`Added "${tildify(binDir)}" to your PATH in ${tildify(configFile)}.`),
					chalk.gray(
						`  You may need to run ${chalk.white.bold(`source ${tildify(configFile)}`)} to reload your shell.`,
					),
				].join('\n'),
			});

			return;
		}

		const resolvedConfigFile = configFile ?? 'your shell config file';

		if (showOneLiner) {
			const oneLiner = `echo -e '${linesToAdd.join('\\n')}' >> "${resolvedConfigFile}" && source "${resolvedConfigFile}"`;

			info({
				message: [
					//
					chalk.gray(`The Apify & Actor CLIs are not in your PATH. Run:`),
					'',
					chalk.white.bold(`  ${oneLiner}`),
				].join('\n'),
			});

			return;
		}

		info({
			message: [
				chalk.gray(`Manually add the following lines to ${resolvedConfigFile} or similar:`),
				...linesToAdd.map((line) => chalk.white.bold(`  ${line}`)),
			].join('\n'),
		});
	}
}
