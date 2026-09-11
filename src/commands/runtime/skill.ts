import process from 'node:process';

import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Flags } from '../../lib/command-framework/flags.js';
import { error, info, simpleLog, success } from '../../lib/outputs.js';
import {
	describeSkillSource,
	frameSkillForReading,
	resolveRuntimeSkill,
	skillTargets,
	stampSkill,
	writeSkillTo,
} from '../../lib/runtime/skill.js';
import { tildify } from '../../lib/utils.js';

export class RuntimeSkillCommand extends ApifyCommand<typeof RuntimeSkillCommand> {
	static override name = 'skill' as const;

	static override description =
		`Prints the Actor runtime's Agent Skill - the instructions an agent needs to drive the runtime ` +
		`(the dev-folder loop, debug mode, browser view, migration testing, the API fallback).\n` +
		`The skill ships inside the runtime image, so it always describes the runtime you actually have. ` +
		`It is read over HTTP when the runtime is running, and straight out of the installed image when ` +
		`it is not - so 'apify runtime install' is all it needs.\n` +
		`Use --install to put it in your agent's skills directory, where it loads on demand in this and ` +
		`later sessions instead of only the terminal it was printed into.`;

	static override group = 'Local Actor Development';

	static override examples = [
		{
			description: `Install the skill for the agents on this machine.`,
			command: 'apify runtime skill --install',
		},
		{
			description: 'Print the skill to read it now.',
			command: 'apify runtime skill',
		},
		{
			description: `Save it somewhere else.`,
			command: 'apify runtime skill > SKILL.md',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-runtime-skill';

	static override flags = {
		install: Flags.boolean({
			description: `Write the skill into every agent skills directory found, instead of printing it.`,
			default: false,
		}),
		raw: Flags.boolean({
			description: `Print the file exactly as it ships, frontmatter and all, with no added header.`,
			default: false,
		}),
	};

	async run() {
		const resolved = await resolveRuntimeSkill();

		if (!resolved) {
			error({
				message: [
					`Could not read the Actor runtime's Agent Skill.`,
					`  The skill ships inside the runtime image, so install it first:`,
					chalk.white.bold(`    apify runtime install`),
				].join('\n'),
			});
			process.exitCode = 1;
			return;
		}

		const { content, source } = resolved;

		if (!this.flags.install) {
			// stdout only, so 'apify runtime skill > SKILL.md' stays a clean file - the same contract
			// 'apify help --skill' already has.
			simpleLog({
				stdout: true,
				message: (this.flags.raw ? content : frameSkillForReading(content, source)).trimEnd(),
			});
			return;
		}

		const stamped = stampSkill(content, source);
		const written: string[] = [];

		for (const target of skillTargets()) {
			try {
				await writeSkillTo(target, stamped);
				written.push(`  ${tildify(target.directory)}  ${chalk.gray(`(${target.label})`)}`);
			} catch (err) {
				// One unwritable location (a read-only home, a project directory owned by someone else)
				// must not lose the installs that did work.
				info({ message: chalk.gray(`Skipped ${tildify(target.directory)}: ${(err as Error).message}`) });
			}
		}

		if (!written.length) {
			error({ message: `Could not write the skill to any agent skills directory.` });
			process.exitCode = 1;
			return;
		}

		success({ message: `Installed the Actor runtime skill from ${describeSkillSource(source)}:` });
		simpleLog({ message: written.join('\n') });
		simpleLog({
			message: chalk.gray(`\nAgents pick it up on their next start. Re-run this after upgrading the runtime image.`),
		});
	}
}
