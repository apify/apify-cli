import process from 'node:process';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Args } from '../../lib/command-framework/args.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { info, simpleLog } from '../../lib/outputs.js';
import { getLoggedClientOrThrow, getLocalUserInfo, printJsonToStdout } from '../../lib/utils.js';

// Exit code 1 = the name is available (not taken). Chosen so that a pure
// `apify actors exists foo && echo taken || echo free` shell idiom works
// without extra flags, matching the convention of tools like `test`, `grep`,
// and `gh repo view`.
const NOT_FOUND_EXIT_CODE = 1;

export class ActorsExistsCommand extends ApifyCommand<typeof ActorsExistsCommand> {
	static override name = 'exists' as const;

	static override description =
		`Check whether an Actor exists on the Apify platform.\n` +
		`Exits 0 if the Actor exists (name is taken), 1 if not.\n` +
		`Intended for scripting a pre-flight check before 'apify push' so callers can pick a free name without triggering a duplicate-name error.`;

	static override examples = [
		{
			description: 'Check whether a name in your own namespace is available.',
			command: 'apify actors exists my-crawler',
		},
		{
			description: 'Check a fully qualified Actor identifier.',
			command: 'apify actors exists apify/hello-world',
		},
		{
			description: 'Use in a shell script to avoid a name collision.',
			command: 'apify actors exists my-crawler || apify push',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-actors-exists';

	static override enableJsonFlag = true;

	static override args = {
		actorId: Args.string({
			description:
				'Actor name (short "my-crawler" — resolved in the logged-in user\'s namespace) ' +
				'or fully qualified "<username>/<name>" identifier, or Actor ID.',
			required: true,
		}),
	};

	static override flags = {
		quiet: Flags.boolean({
			char: 'q',
			description: 'Suppress the human-readable message; only the exit code is meaningful.',
			default: false,
		}),
	};

	async run() {
		const { actorId } = this.args;
		const { quiet, json } = this.flags;

		const apifyClient = await getLoggedClientOrThrow();

		// Resolve short names ("my-crawler") to "<username>/my-crawler" so callers
		// can query their own namespace without repeating their username.
		let lookupId = actorId;
		if (!actorId.includes('/') && !/^[A-Za-z0-9]{17}$/.test(actorId)) {
			const userInfo = await getLocalUserInfo();
			const usernameOrId = userInfo.username || userInfo.id;
			lookupId = `${usernameOrId}/${actorId}`;
		}

		const actor = await apifyClient.actor(lookupId).get();

		if (json) {
			printJsonToStdout({
				exists: Boolean(actor),
				query: actorId,
				resolvedId: lookupId,
				actor: actor ? { id: actor.id, name: actor.name, username: actor.username, title: actor.title } : null,
			});
			if (!actor) process.exitCode = NOT_FOUND_EXIT_CODE;
			return;
		}

		if (actor) {
			if (!quiet) {
				info({
					stdout: true,
					message: `Actor "${actor.username}/${actor.name}" exists (id=${actor.id}).`,
				});
			}
			return;
		}

		process.exitCode = NOT_FOUND_EXIT_CODE;
		if (!quiet) {
			simpleLog({
				stdout: true,
				message: `Actor "${lookupId}" does not exist.`,
			});
		}
	}
}
