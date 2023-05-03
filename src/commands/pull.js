const fs = require('fs');
const path = require('path');
const tiged = require('tiged');
const AdmZip = require('adm-zip');
const semverGt = require('semver/functions/gt');
const { get } = require('axios');
const { ApifyCommand } = require('../lib/apify_command');
const { success, error } = require('../lib/outputs');
const { getLoggedClientOrThrow } = require('../lib/utils');

const extractGitHubZip = async (url, directoryPath) => {
    const { data } = await get(url, { responseType: 'arraybuffer' });

    const zipFile = new AdmZip(Buffer.from(data, 'binary'));
    zipFile.extractAllTo(directoryPath);
};

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
        fs.mkdirSync(dirpath, { recursive: true }, null);

        if (!(fs.readdirSync(dirpath).length === 0)) {
            error(`Directory ${dirpath} is not empty. Please empty it or choose another directory.`);
        }

        let isPullSuccessful = false;

        switch (latestVersion.sourceType) {
            case 'TARBALL': {
                await extractGitHubZip(latestVersion.tarballUrl, dirpath);
                isPullSuccessful = true;
                break;
            }
            case 'SOURCE_FILES': {
                const { sourceFiles } = latestVersion;
                for (const file of sourceFiles) {
                    const folderPath = file.folder ? file.folder : path.dirname(file.name);
                    fs.mkdirSync(`${dirpath}/${folderPath}`, { recursive: true }, null);

                    if (!file.folder) {
                        const fileContent = file.format === 'BASE64' ? Buffer.from(file.content, 'base64') : file.content;
                        fs.writeFileSync(`${dirpath}/${file.name}`, fileContent);
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
                let branchDirRepoUrl = repoUrl;
                if (dir) branchDirRepoUrl += `/${dir}`;
                if (branch) branchDirRepoUrl += `#${branch}`;

                const emitter = tiged(branchDirPart ? branchDirRepoUrl : repoUrl);
                try {
                    await emitter.clone(dirpath);
                } catch (err) {
                    error(`Failed to pull actor from ${gitRepoUrl}.`);
                    break;
                }

                isPullSuccessful = true;
                break;
            }
            case 'GITHUB_GIST': {
                await extractGitHubZip(`${latestVersion.gitHubGistUrl}/archive/master.zip`, dirpath);

                isPullSuccessful = true;
                break;
            }
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
