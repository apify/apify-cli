const { spawn } = require('child_process');
const outputs = require('./outputs');

/**
 * Run child process and returns stout and stderr to user stout
 */
const spawnPromised = (cmd, args, opts) => {
    const command = spawn(cmd, args, opts);

    command.stdout.on('data', (data) => {
        if (data) console.log(data.toString());
    });

    command.stderr.on('data', (data) => {
        if (data) console.log(data.toString());
    });

    return new Promise((resolve, reject) => {
        command.on('close', (code) => {
            if (code !== 0) reject(new Error(`${cmd} exited with code ${code}`));
            resolve();
        });
    });
};

module.exports = async (cmd, args = [], opts = {}) => {
    outputs.run(`${cmd} ${args.join(' ')}`);
    await spawnPromised(cmd, args, opts);
};
