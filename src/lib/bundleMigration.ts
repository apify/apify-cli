import { chmodSync, copyFileSync, existsSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import process from 'node:process';

import { useCLIMetadata } from './hooks/useCLIMetadata.js';
import { cliDebugPrint } from './utils/cliDebugPrint.js';

const ENTRYPOINTS = ['apify', 'actor'] as const;

/**
 * POSIX `sh` wrapper that invokes the `apify-cli` bundle with the right entrypoint. Used directly on Unix,
 * and by Git Bash / MSYS2 / Cygwin on Windows (those resolve the bare, extensionless name, not `.cmd`).
 */
export function unixWrapperScript(entrypoint: string) {
	return [
		'#!/bin/sh',
		'DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"',
		`APIFY_CLI_ENTRYPOINT=${entrypoint} exec "$DIR/apify-cli" "$@"`,
		'',
	].join('\n');
}

/**
 * Windows `.cmd` wrapper (for `cmd.exe`). `setlocal` keeps `APIFY_CLI_ENTRYPOINT` from leaking into the
 * caller's shell; the implicit `endlocal` at end-of-file preserves the bundle's exit code.
 */
export function windowsCmdWrapperScript(entrypoint: string) {
	return ['@echo off', 'setlocal', `set "APIFY_CLI_ENTRYPOINT=${entrypoint}"`, '"%~dp0apify-cli.exe" %*', ''].join(
		'\r\n',
	);
}

/**
 * Windows PowerShell wrapper (`.ps1`). PowerShell can run the `.cmd` via PATHEXT, but a native `.ps1`
 * avoids spawning `cmd.exe` and is what some tools look for. The env var is restored afterwards so it does
 * not leak into the caller's session, and the bundle's exit code is propagated.
 */
export function windowsPowershellWrapperScript(entrypoint: string) {
	return [
		'#!/usr/bin/env pwsh',
		'$prev = $env:APIFY_CLI_ENTRYPOINT',
		`$env:APIFY_CLI_ENTRYPOINT = "${entrypoint}"`,
		'try {',
		'    & "$PSScriptRoot\\apify-cli.exe" @args',
		'} finally {',
		'    $env:APIFY_CLI_ENTRYPOINT = $prev',
		'}',
		'exit $LASTEXITCODE',
		'',
	].join('\r\n');
}

/**
 * Writes `data` to `targetPath` atomically: it writes to a temp file in the same directory and then renames
 * it into place. The rename swaps the directory entry without touching the inode that may be backing a
 * running process, so this is safe even when `targetPath` is a binary that is currently executing (writing
 * to it directly would fail with `ETXTBSY` on Linux).
 */
function atomicWriteSync(targetPath: string, data: string | Buffer, mode?: number) {
	const tmpPath = `${targetPath}.${process.pid}.tmp`;

	try {
		writeFileSync(tmpPath, data);

		if (mode !== undefined) {
			chmodSync(tmpPath, mode);
		}

		renameSync(tmpPath, targetPath);
	} catch (err) {
		try {
			rmSync(tmpPath, { force: true });
		} catch {
			// best-effort cleanup
		}

		throw err;
	}
}

/**
 * Copies `srcPath` to `targetPath` atomically (temp file + rename), so an in-place overwrite never truncates
 * a running executable. See {@link atomicWriteSync}.
 */
function atomicCopySync(srcPath: string, targetPath: string, mode?: number) {
	const tmpPath = `${targetPath}.${process.pid}.tmp`;

	try {
		copyFileSync(srcPath, tmpPath);

		if (mode !== undefined) {
			chmodSync(tmpPath, mode);
		}

		renameSync(tmpPath, targetPath);
	} catch (err) {
		try {
			rmSync(tmpPath, { force: true });
		} catch {
			// best-effort cleanup
		}

		throw err;
	}
}

/**
 * (Re)creates the `apify` and `actor` wrapper scripts in `binDir`, pointing at the `apify-cli` bundle.
 *
 * Always writes the extensionless POSIX `sh` shim; on Windows it additionally writes a `.cmd` (for cmd.exe)
 * and a `.ps1` (for PowerShell) so the command resolves from every shell. Each file is written atomically
 * and independently, so one failure does not prevent the others.
 */
export function writeEntrypointShims(binDir: string, isWindows: boolean) {
	for (const entrypoint of ENTRYPOINTS) {
		atomicWriteSync(join(binDir, entrypoint), unixWrapperScript(entrypoint), 0o755);

		if (isWindows) {
			atomicWriteSync(join(binDir, `${entrypoint}.cmd`), windowsCmdWrapperScript(entrypoint));
			atomicWriteSync(join(binDir, `${entrypoint}.ps1`), windowsPowershellWrapperScript(entrypoint));
		}
	}
}

/**
 * Older CLI installs shipped two full bundles (`apify` and `actor`) plus an `apify-cli` copy, dropping the
 * same binary three times into the install directory. The CLI now ships a single `apify-cli` bundle, with
 * `apify` and `actor` being tiny wrapper scripts that set `APIFY_CLI_ENTRYPOINT`.
 *
 * When a user upgrades from an old install, the upgrade overwrites the legacy `apify`/`actor` bundles with
 * the new single bundle. On the first run afterwards this migrates the directory into the new layout:
 * the running bundle is copied to `apify-cli` and the `apify`/`actor` bundles are replaced by wrapper scripts.
 *
 * Every step is best-effort, atomic, and isolated: if anything fails, the running process keeps working and
 * the migration is retried (and completed) on the next run.
 */
export function migrateLegacyBundleInstallIfNeeded() {
	const metadata = useCLIMetadata();

	// Only on-disk bundle installs have this layout to migrate
	if (metadata.installMethod !== 'bundle') {
		return;
	}

	const isWindows = metadata.platform === 'windows';
	const binDir = dirname(process.execPath);
	const selfName = basename(process.execPath)
		.replace(/\.exe$/i, '')
		.toLowerCase();

	// Best-effort cleanup of binaries renamed by a previous migration run. On Windows we cannot delete the
	// currently running executable, only rename it, so the leftover `.old` file is removed on a later run.
	if (isWindows) {
		for (const entrypoint of ENTRYPOINTS) {
			const stalePath = join(binDir, `${entrypoint}.exe.old`);

			if (existsSync(stalePath)) {
				try {
					rmSync(stalePath, { force: true });
					cliDebugPrint('[migration] removed stale legacy binary', stalePath);
				} catch (err) {
					cliDebugPrint('[migration] failed to remove stale legacy binary', { stalePath, err });
				}
			}
		}
	}

	// Already running as the single `apify-cli` bundle - the install is migrated
	if (selfName === 'apify-cli') {
		return;
	}

	// We only know how to migrate the legacy `apify`/`actor` full bundles
	if (!(ENTRYPOINTS as readonly string[]).includes(selfName)) {
		return;
	}

	cliDebugPrint('[migration] legacy multi-bundle install detected, migrating to single bundle', {
		binDir,
		selfName,
	});

	const ext = isWindows ? '.exe' : '';
	const apifyCliPath = join(binDir, `apify-cli${ext}`);

	// 1. Copy the bundle we are currently running as into the canonical `apify-cli` binary. If this fails
	//    we bail out without touching the wrappers (they would otherwise point at a stale/missing binary);
	//    the running bundle is untouched, so the migration is retried on the next run.
	try {
		atomicCopySync(process.execPath, apifyCliPath, isWindows ? undefined : 0o755);

		cliDebugPrint('[migration] copied current bundle to', apifyCliPath);
	} catch (err) {
		cliDebugPrint('[migration] failed to copy current bundle, will retry on next run', { err });
		return;
	}

	// 2. Replace the `apify` and `actor` bundles with wrapper scripts. On Unix this atomically overwrites the
	//    running bundle (a rename swaps the inode, avoiding ETXTBSY); on Windows the wrappers are separate
	//    `.cmd`/`.ps1`/sh files alongside the legacy `.exe`, which is cleaned up below.
	try {
		writeEntrypointShims(binDir, isWindows);
		cliDebugPrint('[migration] wrote entrypoint shims');
	} catch (err) {
		cliDebugPrint('[migration] failed to write entrypoint shims, will retry on next run', { err });
	}

	// 3. On Windows, remove the legacy full bundles so the wrappers (not the `.exe`) resolve on PATH. Each is
	//    isolated; the currently-running `.exe` cannot be deleted, only renamed (cleaned up on a later run).
	if (isWindows) {
		for (const entrypoint of ENTRYPOINTS) {
			const legacyBinaryPath = join(binDir, `${entrypoint}.exe`);

			if (!existsSync(legacyBinaryPath)) {
				continue;
			}

			try {
				if (resolve(legacyBinaryPath) === resolve(process.execPath)) {
					renameSync(legacyBinaryPath, `${legacyBinaryPath}.old`);
					cliDebugPrint('[migration] renamed running legacy binary', legacyBinaryPath);
				} else {
					rmSync(legacyBinaryPath, { force: true });
				}
			} catch (err) {
				try {
					renameSync(legacyBinaryPath, `${legacyBinaryPath}.old`);
				} catch {
					// leave it; a later run will retry
				}

				cliDebugPrint('[migration] failed to remove legacy binary', { legacyBinaryPath, err });
			}
		}
	}

	cliDebugPrint('[migration] migration to single bundle complete');
}
