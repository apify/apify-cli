const chalk = require('chalk');
const mkdirp = require('mkdirp');
const fs = require('fs');
const path = require('path');
const tiged = require('tiged');
const { ApifyCommand } = require('../lib/apify_command');
const { getLoggedClientOrThrow } = require('../lib/utils');

class PullCommand extends ApifyCommand {
    async run() {
        const { args } = this.parse(PullCommand);
        const apifyClient = await getLoggedClientOrThrow();
        const cwd = process.cwd();

        const { actorId } = args;
        const actor = await apifyClient.actor(actorId).get();
        if (!actor) throw new Error(`Cannot find actor with ID '${actorId}' in your account.`);
        const { name, versions } = actor;

        // TODO: Check is sorted chronologically
        const lastVersion = versions[versions.length - 1];

        const dirpath = path.join(cwd, name);
        mkdirp.sync(dirpath);

        switch (lastVersion.sourceType) {
            case 'TARBALL':
            case 'SOURCE_FILES': {
                const { sourceFiles } = lastVersion;
                for (const file of sourceFiles) {
                    if (file.folder) mkdirp.sync(path.join(cwd, name, file.name));
                    else fs.writeFileSync(`${dirpath}/${file.name}`, file.content);
                }
                console.log(`${chalk.green('Pulled to')} ${dirpath}/`);
                break;
            }
            case 'GIT_REPO': {
                // e.g. https://github.com/jakubbalada/Datasety.git#master:RejstrikPolitickychStran
                const { gitRepoUrl } = lastVersion;
                const [repoUrl, branchDirPart] = gitRepoUrl.split('#');

                // TODO: Handle defaults and edge cases
                let branch;
                let dir;
                if (branchDirPart) [branch, dir] = branchDirPart.split(':');

                const emitter = tiged(`${repoUrl}/${dir}#${branch}`);
                await emitter.clone(dirpath);

                break;
            }
            default:
                throw new Error(`Unknown source type: ${lastVersion.sourceType}`);
        }
    }
}

PullCommand.description = 'Pulls the latest version of an actor from the Apify platform to the current directory. ';

PullCommand.args = [
    {
        name: 'actorId',
        required: false,
        description: 'ID of an existing actor on the Apify platform which will be pulled. '
            + 'If not provided, the command will pull the actor specified in "apify.json" file.',
    },
];

module.exports = PullCommand;
