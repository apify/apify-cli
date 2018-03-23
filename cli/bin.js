#!/usr/bin/env node
/* eslint-disable */
// const parseArgs = require('minimist');
const outputs = require('./lib/outputs');
//
// (async () => {
//     try {
//         const args = parseArgs(process.argv.slice(2), { '--': false });
//
//         const cmd = args._.shift();
//
//         switch (cmd) {
//             case 'login':
//             case 'logout':
//             case 'help':
//             case 'create':
//             case 'init':
//             case 'run':
//             case 'push':
//             case 'call':
//                 await require(`./commands/${cmd}`)(args);
//                 break;
//             case 'acts':
//             case 'keyValueStores':
//             case 'crawlers':
//             case 'datasets':
//             case 'logs':
//                 console.log('We are working on this command, stay tune https://github.com/apifytech/apify-cli');
//                 break;
//             case undefined:
//                 console.log('Specified command or call for help with apify help.');
//                 break;
//             case 'test':
//                 const command = new require(`./commands/${cmd}`);
//                 await command.run()
//                 break;
//             default:
//                 console.log(`I don't know command ${cmd}, call for help with apify help.`);
//         }
//     } catch (err) {
//         outputs.error(err.message);
//     }
//     process.exit(0);
// })();


(async () => {
    try {
        await require('@oclif/command').run()
    } catch (err) {
        const exitCode = (err.oclif && err.oclif.exit !== undefined) ? err.oclif.exit : 1;
        if (exitCode !== 0) outputs.error(err.message);
    }
})();
