const { spawn } = require('child_process');
const outputs = require('./outputs');

/**
 * Run child process and returns stdout and stderr to user stout
 */
const spawnPromised = (cmd, args, opts) => {
    const process = spawn(cmd, args, opts);

    process.stdout.on('data', (data) => {
        if (data) console.log(data.toString());
    });

    process.stderr.on('data', (data) => {
        if (data) console.log(data.toString());
    });

    return new Promise((resolve, reject) => {
        process.on('close', (code) => {
            if (code !== 0) reject(new Error(`${cmd} exited with code ${code}`));
            resolve();
        });
    });
};

module.exports = async (cmd, args = [], opts = {}) => {
    outputs.run(`${cmd} ${args.join(' ')}`);
    await spawnPromised(cmd, args, opts);
};
