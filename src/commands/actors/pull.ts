import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';

import AdmZip from 'adm-zip';
import axios from 'axios';
import jju from 'jju';
import { gt } from 'semver';
import tiged from 'tiged';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { CommandExitCodes, LOCAL_CONFIG_PATH } from '../../lib/consts.js';
import { useActorConfig } from '../../lib/hooks/useActorConfig.js';
import { error, success } from '../../lib/outputs.js';
import { getLocalUserInfo, getLoggedClientOrThrow } from '../../lib/utils.js';

const extractGitHubZip = async (url: string, directoryPath: string) => {
	const { data } = await axios.get(url, { responseType: 'arraybuffer' });

	const zipFile = new AdmZip(Buffer.from(data, 'binary'));

	zipFile.extractEntryTo(zipFile.getEntries()[0].entryName, directoryPath, false);
};

export class ActorsPullCommand extends ApifyCommand<typeof ActorsPullCommand> {
	static override name = 'pull' as const;

	static override description =
		'Download Actor code to current directory. ' +
		'Clones Git repositories or fetches Actor files based on the source type.';

	static override flags = {
		version: Flags.string({
			char: 'v',
			description: 'Actor version number which will be pulled, e.g. 1.2. Default: the highest version',
			required: false,
		}),
		dir: Flags.string({
			description: 'Directory where the Actor should be pulled to',
			required: false,
		}),
	};

	static override args = {
		actorId: Args.string({
			required: false,
			description:
				'Name or ID of the Actor to run (e.g. "apify/hello-world" or "E2jjCZBezvAZnX8Rb"). ' +
				'If not provided, the command will update the Actor in the current directory based on its name in ".actor/actor.json" file.',
		}),
	};

	async run() {
		const cwd = process.cwd();

		const actorConfigResult = await useActorConfig({ cwd });

		if (actorConfigResult.isErr()) {
			error({ message: actorConfigResult.unwrapErr().message });
			process.exitCode = CommandExitCodes.InvalidActorJson;
			return;
		}

		const { config: actorConfig } = actorConfigResult.unwrap();

		const userInfo = await getLocalUserInfo();
		const apifyClient = await getLoggedClientOrThrow();

		const isActorAutomaticallyDetected = !this.args.actorId;
		const usernameOrId = userInfo.username || userInfo.id;

		const actorId =
			this.args?.actorId ||
			(actorConfig?.id as string | undefined) ||
			(actorConfig?.name ? `${usernameOrId}/${actorConfig.name}` : undefined);

		if (!actorId) throw new Error('Cannot find Actor in this directory.');

		let actor;
		try {
			actor = await apifyClient.actor(actorId).get();
		} catch {
			throw new Error(`Cannot find Actor with ID/name '${actorId}' in your account.`);
		}

		if (!actor) throw new Error(`Cannot find Actor with ID/name '${actorId}' in your account.`);

		const { name, versions } = actor;

		let correctVersion = null;
		if (this.flags?.version) {
			correctVersion = versions.find((version) => version.versionNumber === this.flags?.version);
			if (!correctVersion) {
				throw new Error(`Cannot find version ${this.flags?.version} of Actor ${actorId}.`);
			}
		}

		if (!correctVersion) {
			correctVersion = versions.reduce((match, curr) => {
				if (gt(`${curr.versionNumber}.0`, `${match.versionNumber}.0`)) return curr;
				return match;
			});
		}

		const dirpath = isActorAutomaticallyDetected ? cwd : join(cwd, this.flags.dir ?? name);
		mkdirSync(dirpath, { recursive: true });

		if (!isActorAutomaticallyDetected && !(readdirSync(dirpath).length === 0)) {
			error({ message: `Directory ${dirpath} is not empty. Please empty it or choose another directory.` });
			return;
		}

		switch (correctVersion.sourceType) {
			case 'TARBALL': {
				await extractGitHubZip(correctVersion.tarballUrl, dirpath);

				break;
			}
			case 'SOURCE_FILES': {
				const { sourceFiles } = correctVersion;
				for (const file of sourceFiles) {
					const folderPath = dirname(file.name);
					mkdirSync(`${dirpath}/${folderPath}`, { recursive: true });

					// @ts-expect-error TODO: is this an actual field?
					if (!file.folder) {
						const fileContent =
							file.format === 'BASE64' ? Buffer.from(file.content, 'base64').toString() : file.content;

						if (file.name === LOCAL_CONFIG_PATH) {
							const actorJson = jju.parse(fileContent);
							actorJson.name = actor.name;
							writeFileSync(`${dirpath}/${file.name}`, jju.update(fileContent, actorJson));
						} else {
							writeFileSync(`${dirpath}/${file.name}`, fileContent);
						}
					}
				}

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
					throw new Error(`Failed to pull Actor from ${gitRepoUrl}. ${(err as Error).message}`);
				}

				break;
			}
			case 'GITHUB_GIST': {
				await extractGitHubZip(`${correctVersion.gitHubGistUrl}/archive/master.zip`, dirpath);

				break;
			}
			default:
				throw new Error(`Unknown source type: ${correctVersion.sourceType}`);
		}

		success({
			message: isActorAutomaticallyDetected ? `Actor ${name} updated at ${dirpath}/` : `Pulled to ${dirpath}/`,
		});
	}
}
