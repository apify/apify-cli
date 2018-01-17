#!/usr/bin/env node

'use strict';
const args = require('minimist')(process.argv.slice(2));
// const pwd = process.cwd();

console.log(args);

const cmd = args._.shift();

switch (cmd) {
    case undefined:
        console.log('Specified command or use apify --help');
        break;
    case 'acts':
        require('./commands/acts')(args);
        break;
    default:
        console.log(`I don't know command ${cmd}`);
}