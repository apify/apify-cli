const util = require('util');
const exec = util.promisify(require('child_process').exec);

module.exports = async (cmd, opts) => {
    opts = Object.assign({}, opts);
    const { stdout, stderr } = await exec(cmd, opts);
    console.log(stdout);
    console.log(stderr);
};
