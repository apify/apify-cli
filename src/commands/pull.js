const mkdirp = require('mkdirp');
const fs = require('fs');
const path = require('path');
const tiged = require('tiged');
const AdmZip = require('adm-zip');
const semverGt = require('semver/functions/gt');
const { get } = require('axios');
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

        const latestVersion = versions.reduce((match, curr) => {
            if (semverGt(`${curr.versionNumber}.0`, `${match.versionNumber}.0`)) return curr;
            return match;
        });

        const dirpath = path.join(cwd, name);
        mkdirp.sync(dirpath);

        if (!(fs.readdirSync(dirpath).length === 0)) {
            error(`Directory ${dirpath} is not empty. Please empty it or choose another directory.`);
        }

        let isPullSuccessful = false;

        switch (latestVersion.sourceType) {
            case 'TARBALL': {
                const { tarballUrl } = latestVersion;

                const { data } = await get(tarballUrl, { responseType: 'arraybuffer' });

                const zipFile = new AdmZip(Buffer.from(data, 'binary'));
                zipFile.extractAllTo(dirpath);
                break;
            }
            case 'SOURCE_FILES': {
                const { sourceFiles } = latestVersion;
                for (const file of sourceFiles) {
                    if (!file.folder) {
                        mkdirp.sync(dirpath);
                        fs.writeFileSync(`${dirpath}/${file.name}`, file.content);
                    }
                }
                isPullSuccessful = true;
                break;
            }
            case 'GIT_REPO': {
                // e.g. https://github.com/jakubbalada/Datasety.git#master:RejstrikPolitickychStran
                const { gitRepoUrl } = latestVersion;
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
            case 'GITHUB_GIST':
                throw new Error('Pulling from GitHub Gist is not supported.');
            default:
                throw new Error(`Unknown source type: ${latestVersion.sourceType}`);
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
