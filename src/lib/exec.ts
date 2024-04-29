import { SpawnOptions, SpawnOptionsWithoutStdio, spawn } from 'node:child_process';

import { run } from './outputs.js';

const windowsOptions: SpawnOptions = {
    shell: true,
    windowsHide: true,
};

/**
 * Run child process and returns stdout and stderr to user stout
 */
const spawnPromised = async (cmd: string, args: string[], opts: SpawnOptionsWithoutStdio) => {
    // NOTE: Pipes stderr, stdout to main process
    const childProcess = spawn(cmd, args, {
        ...opts,
        stdio: process.env.APIFY_NO_LOGS_IN_TESTS ? 'ignore' : 'inherit',
        ...(process.platform === 'win32' ? windowsOptions : {}),
    });

    // Catch ctrl-c (SIGINT) and kills child process
    // NOTE: This fix kills also puppeteer child node process
    process.on('SIGINT', () => {
        try {
            childProcess.kill();
        } catch {
            // SIGINT can come after the child process is finished, ignore it
        }
    });

    return new Promise<void>((resolve, reject) => {
        childProcess.on('error', reject);
        childProcess.on('close', (code) => {
            if (code !== 0) reject(new Error(`${cmd} exited with code ${code}`));
            resolve();
        });
    });
};

export async function execWithLog(cmd: string, args: string[] = [], opts: SpawnOptionsWithoutStdio = {}) {
    run(`${cmd} ${args.join(' ')}`);
    await spawnPromised(cmd, args, opts);
}
