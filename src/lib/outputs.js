const chalk = require('chalk');

const error = (message) => {
    console.log(`${chalk.red('Error:')} ${message}`);
};

const warning = (message) => {
    console.log(`${chalk.rgb(254, 90, 29).bold('Warning:')} ${message}`);
};

const success = (message) => {
    console.log(`${chalk.green('Success:')} ${message}`);
};

const run = (message) => {
    console.log(`${chalk.gray('Run:')} ${message}`);
};

const info = (message) => {
    console.log(`${chalk.white('Info:')} ${message}`);
};

const link = (title, url) => {
    console.log(`${chalk.blue(title)} -> ${url}`);
};

module.exports = { error, success, run, info, warning, link };
