#!/usr/bin/env node

(async () => {
    const args = require('minimist')(process.argv.slice(2));
    const { getConfig } = require('./lib/configs');
    // const pwd = process.cwd();
    // console.log(args);
    // https://www.sitepoint.com/javascript-command-line-interface-cli-node-js/

    const cmd = args._.shift();
    const config = await getConfig();

    switch (cmd) {
        case undefined:
            console.log('Specified command or use apify --help');
            break;
        case 'acts':
            await require('./commands/acts')(args);
            break;
        case 'login':
            await require('./commands/login')(args);
            break;
        case 'push':
        case 'build':
        case 'run':
            if (!config) console.log('You need to be logged with "apify login"');
            await require(`./commands/${cmd}`)(args, config);
            break;
        default:
            console.log(`I don't know command ${cmd}`);
    }
    process.exit(0)
})();