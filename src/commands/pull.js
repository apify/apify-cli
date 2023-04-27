const mkdirp = require('mkdirp');
const fs = require('fs');
const path = require('path');
const tiged = require('tiged');
const { ActorSourceType } = require('apify-client/dist/resource_clients/actor_version');
const { ApifyCommand } = require('../lib/apify_command');
const { success, error } = require('../lib/outputs');
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

        if (!(fs.readdirSync(dirpath).length === 0)) {
            error(`Directory ${dirpath} is not empty. Please empty it or choose another directory.`);
        }

        let isPullSuccessful = false;

        switch (lastVersion.sourceType) {
            case ActorSourceType.Tarball:
            case ActorSourceType.SourceFiles: {
                const { sourceFiles } = lastVersion;
                for (const file of sourceFiles) {
                    if (!file.folder) {
                        mkdirp.sync(dirpath);
                        fs.writeFileSync(`${dirpath}/${file.name}`, file.content);
                    }
                }
                isPullSuccessful = true;
                break;
            }
            case ActorSourceType.GitRepo: {
                // e.g. https://github.com/jakubbalada/Datasety.git#master:RejstrikPolitickychStran
                const { gitRepoUrl } = lastVersion;
                const [repoUrl, branchDirPart] = gitRepoUrl.split('#');

                let branch;
                let dir;
                if (branchDirPart) [branch, dir] = branchDirPart.split(':');

                const emitter = tiged(branchDirPart ? `${repoUrl}/${dir}#${branch}` : repoUrl);
                try {
                    await emitter.clone(dirpath);
                } catch (err) {
                    error(`Failed to pull actor from ${gitRepoUrl}.`);
                    break;
                }

                isPullSuccessful = true;
                break;
            }
            case ActorSourceType.GitHubGist:
                throw new Error('Pulling from GitHub Gist is not supported.');
            default:
                throw new Error(`Unknown source type: ${lastVersion.sourceType}`);
        }

        if (isPullSuccessful) success(`Pulled to ${dirpath}/`);
    }
}

PullCommand.description = 'Pulls the latest version of an actor from the Apify platform to the current directory. ';

PullCommand.args = [
    {
        name: 'actorId',
        required: true,
        description: 'ID or name (username/actor_name) of an existing actor on the Apify platform which will be pulled. ',
    },
];

module.exports = PullCommand;
