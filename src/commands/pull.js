const fs = require('fs');
const path = require('path');
const tiged = require('tiged');
const AdmZip = require('adm-zip');
const semverGt = require('semver/functions/gt');
const { get } = require('axios');
const { flags: flagsHelper } = require('@oclif/command');
const jju = require('jju');
const { ApifyCommand } = require('../lib/apify_command');
const { success, error } = require('../lib/outputs');
const { getLoggedClientOrThrow, getLocalConfigOrThrow, getLocalUserInfo } = require('../lib/utils');
const { LOCAL_CONFIG_PATH } = require('../lib/consts');

const extractGitHubZip = async (url, directoryPath) => {
    const { data } = await get(url, { responseType: 'arraybuffer' });

    const zipFile = new AdmZip(Buffer.from(data, 'binary'));

    zipFile.extractEntryTo(zipFile.getEntries()[0].entryName, directoryPath, false);
};

class PullCommand extends ApifyCommand {
    async run() {
        const { args, flags } = this.parse(PullCommand);
        const localConfig = await getLocalConfigOrThrow();
        const userInfo = await getLocalUserInfo();
        const apifyClient = await getLoggedClientOrThrow();
        const cwd = process.cwd();

        const isActorAutomaticallyDetected = !args?.actorId;
        const usernameOrId = userInfo.username || userInfo.id;

        const actorId = args?.actorId || localConfig?.id || (localConfig.name ? `${usernameOrId}/${localConfig.name}` : undefined);

        if (!actorId) throw new Error('Cannot find an Actor in this directory.');

        let actor;
        try {
            actor = await apifyClient.actor(actorId).get();
        } catch {
            throw new Error(`Cannot find Actor with ID/name '${actorId}' in your account.`);
        }

        if (!actor) throw new Error(`Cannot find Actor with ID/name '${actorId}' in your account.`);

        const { name, versions } = actor;

        let correctVersion = null;
        if (flags?.version) {
            correctVersion = versions.find((version) => version.versionNumber === flags?.version);
            if (!correctVersion) {
                error(`Cannot find version ${flags?.version} of Actor ${actorId}. Pulling latest version instead.`);
            }
        }

        if (!correctVersion) {
            correctVersion = versions.reduce((match, curr) => {
                if (semverGt(`${curr.versionNumber}.0`, `${match.versionNumber}.0`)) return curr;
                return match;
            });
        }

        const dirpath = isActorAutomaticallyDetected ? cwd : path.join(cwd, name);
        fs.mkdirSync(dirpath, { recursive: true });

        if (!isActorAutomaticallyDetected && !(fs.readdirSync(dirpath).length === 0)) {
            error(`Directory ${dirpath} is not empty. Please empty it or choose another directory.`);
            return;
        }

        let isPullSuccessful = false;

        switch (correctVersion.sourceType) {
            case 'TARBALL': {
                await extractGitHubZip(correctVersion.tarballUrl, dirpath);
                isPullSuccessful = true;
                break;
            }
            case 'SOURCE_FILES': {
                const { sourceFiles } = correctVersion;
                for (const file of sourceFiles) {
                    const folderPath = file.folder ? file.folder : path.dirname(file.name);
                    fs.mkdirSync(`${dirpath}/${folderPath}`, { recursive: true }, null);

                    if (!file.folder) {
                        const fileContent = file.format === 'BASE64' ? Buffer.from(file.content, 'base64') : file.content;

                        if (file.name === LOCAL_CONFIG_PATH) {
                            const actorJson = jju.parse(fileContent);
                            actorJson.name = actor.name;
                            fs.writeFileSync(`${dirpath}/${file.name}`, jju.update(fileContent, actorJson));
                        } else {
                            fs.writeFileSync(`${dirpath}/${file.name}`, fileContent);
                        }
                    }
                }
                isPullSuccessful = true;
                break;
            }
            case 'GIT_REPO': {
                // e.g. https://github.com/jakubbalada/Datasety.git#master:RejstrikPolitickychStran
                const { gitRepoUrl } = correctVersion;
                const [repoUrl, branchDirPart] = gitRepoUrl.split('#');

                let branch;
                let dir;
                if (branchDirPart) [branch, dir] = branchDirPart.split(':');
                let branchDirRepoUrl = repoUrl;
                if (dir) branchDirRepoUrl += `/${dir}`;
                if (branch) branchDirRepoUrl += `#${branch}`;

                const emitter = tiged(branchDirRepoUrl);
                try {
                    await emitter.clone(dirpath);
                } catch (err) {
                    error(`Failed to pull Actor from ${gitRepoUrl}.`);
                    break;
                }

                isPullSuccessful = true;
                break;
            }
            case 'GITHUB_GIST': {
                await extractGitHubZip(`${correctVersion.gitHubGistUrl}/archive/master.zip`, dirpath);

                isPullSuccessful = true;
                break;
            }
            default:
                throw new Error(`Unknown source type: ${correctVersion.sourceType}`);
        }

        if (isPullSuccessful) success(isActorAutomaticallyDetected ? `Actor ${name} updated at ${dirpath}/` : `Pulled to ${dirpath}/`);
    }
}

PullCommand.description = 'Pulls the latest version of an Actor from the Apify platform to the current directory. ';

PullCommand.flags = {
    version: flagsHelper.string({
        char: 'v',
        description: 'Actor version number which will be pulled.',
        required: false,
    }),
};

PullCommand.args = [
    {
        name: 'actorId',
        required: false,
        description: 'ID of an existing Actor on the Apify platform which will be pulled. If not provided, '
            + 'the command will update the Actor in the current directory based on its name in the ".actor/actor.json" file.',
    },
];

module.exports = PullCommand;
