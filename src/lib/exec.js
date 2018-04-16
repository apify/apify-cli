const { spawn } = require('child_process');
const outputs = require('./outputs');

/**
 * Run child process and returns stdout and stderr to user stout
 */
const spawnPromised = (cmd, args, opts) => {
    const childProcess = spawn(cmd, args, opts);

    // Catch ctrl-c (SIGINT) and kills child process
    // NOTE: This fix kills also puppeteer child node process
    process.on('SIGINT', () => {
        try {
            childProcess.kill();
        } catch (err) {
            // SIGINT can come after the child process is finished, ignore it
        }
    });

    childProcess.stdout.on('data', (data) => {
        if (data) console.log(data.toString());
    });

    childProcess.stderr.on('data', (data) => {
        if (data) console.log(data.toString());
    });

    return new Promise((resolve, reject) => {
        childProcess.on('error', reject);
        childProcess.on('close', (code) => {
            if (code !== 0) reject(new Error(`${cmd} exited with code ${code}`));
            resolve();
        });
    });
};

module.exports = async (cmd, args = [], opts = {}) => {
    outputs.run(`${cmd} ${args.join(' ')}`);
    await spawnPromised(cmd, args, opts);
};
