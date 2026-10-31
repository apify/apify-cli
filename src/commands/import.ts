import { resolve } from 'node:path';
import process from 'node:process';

import { isCI } from 'ci-info';

import { ApifyCommand } from '../lib/command-framework/apify-command.js';
import { Args } from '../lib/command-framework/args.js';
import { Flags } from '../lib/command-framework/flags.js';
import { IMPORT_SOURCE_CHOICES, type ImportSource, runImport } from '../lib/git-source/importActor.js';
import { useStdin } from '../lib/hooks/useStdin.js';

/** Shared with `apify create --import`, which runs the same flow. */
export const importFlags = {
	actor: Flags.string({
		description: 'Link an existing Actor, by ID or name, instead of creating one.',
		required: false,
	}),
	branch: Flags.string({
		description: 'Branch the Actor builds from. Defaults to the current branch. Only used with a Git source.',
		required: false,
	}),
	force: Flags.boolean({
		description: 'Switch an Actor that already builds from another Git source without asking.',
		default: false,
		required: false,
	}),
};

export class ImportCommand extends ApifyCommand<typeof ImportCommand> {
	static override name = 'import' as const;

	static override enableProfileFlag = true;

	static override description =
		'Turns an existing directory into an Actor. Creates the Actor, or links an existing one, so the next "apify push" from the directory targets it. ' +
		'When the directory is in a Git repository with an origin remote on GitHub, GitLab, or Bitbucket, the Actor builds from that repository, branch, and folder.';

	static override group = 'Local Actor Development';

	static override interactive = true;

	static override interactiveNote =
		'Opens the browser to connect your Git provider to Apify when it is not connected yet, and asks before switching an Actor that already builds from another Git source. To run non-interactively, pass --force to allow the switch.';

	static override examples = [
		{
			description: 'Create the Actor named in .actor/actor.json and build it from the current repository and branch.',
			command: 'apify import',
		},
		{
			description: 'Import an Actor from a folder of a monorepo.',
			command: 'apify import --dir actors/my-actor',
		},
		{
			description: 'Link an existing Actor without pointing it at Git; "apify push" uploads the directory.',
			command: 'apify import --actor my-actor --source none',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-import';

	static override args = {
		actorName: Args.string({
			required: false,
			description: 'Name of the Actor to create or link. Defaults to the name in .actor/actor.json.',
		}),
	};

	static override flags = {
		...importFlags,
		source: Flags.string({
			description:
				'Where the Actor builds from. With "git", the origin remote at the current branch and folder. With "none", the Actor is not pointed at Git, and "apify push" uploads the directory; an Actor that already builds from Git keeps that source until a push replaces it. Defaults to "git" when the directory has an origin remote on GitHub, GitLab, or Bitbucket.',
			choices: [...IMPORT_SOURCE_CHOICES],
			required: false,
		}),
		'auto-build': Flags.string({
			description:
				'Whether a push to the repository rebuilds the Actor. On by default. Turning it on registers a push webhook, which needs admin rights on the repository. Only used with a Git source.',
			choices: ['on', 'off'],
			required: false,
		}),
		dir: Flags.string({
			description: 'Directory to import. Defaults to the current directory.',
			required: false,
		}),
	};

	static override enableJsonFlag = true;

	async run() {
		const { isTTY } = await useStdin();

		await runImport({
			dir: resolve(process.cwd(), this.flags.dir ?? '.'),
			name: this.args.actorName,
			actor: this.flags.actor,
			source: this.flags.source as ImportSource | undefined,
			branch: this.flags.branch,
			autoBuild: this.flags.autoBuild,
			force: this.flags.force,
			json: !!this.flags.json,
			isInteractive: isTTY && !isCI && !this.flags.json,
		});
	}
}
