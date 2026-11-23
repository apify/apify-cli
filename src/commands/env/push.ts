import process from 'node:process';

import chalk from 'chalk';

import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { Flags, YesFlag } from '../../lib/command-framework/flags.js';
import type { EnvPushAction, EnvPushStep } from '../../lib/env-vars/diff.js';
import { compareEnvVars, envPushWrites, planEnvPush } from '../../lib/env-vars/diff.js';
import { failOnMalformedLines, readDotEnv } from '../../lib/env-vars/dotenv.js';
import { envFail } from '../../lib/env-vars/errors.js';
import { envTargetFlags } from '../../lib/env-vars/flags.js';
import {
	describeTarget,
	printRebuildReminder,
	renderEnvPushPlan,
	skipInvalidDotEnvNames,
	targetJson,
} from '../../lib/env-vars/output.js';
import {
	createPlatformEnvVar,
	deletePlatformEnvVar,
	listPlatformEnvVars,
	updatePlatformEnvVar,
	validateEnvVarName,
	validateEnvVarValue,
} from '../../lib/env-vars/platform.js';
import type { EnvTarget } from '../../lib/env-vars/target.js';
import { resolveEnvTarget } from '../../lib/env-vars/target.js';
import { useYesNoConfirm } from '../../lib/hooks/user-confirmations/useYesNoConfirm.js';
import { error, info, simpleLog, success } from '../../lib/outputs.js';
import { printJsonToStdout } from '../../lib/utils.js';

interface EnvPushChange extends EnvPushStep {
	result?: 'done' | 'failed';
	error?: string;
}

const RESULT_TEXT: Partial<Record<EnvPushAction, { done: string; failed: string }>> = {
	'add': { done: 'Added', failed: 'add' },
	'update': { done: 'Updated', failed: 'update' },
	'replace-secret': { done: 'Replaced', failed: 'replace' },
	'remove': { done: 'Deleted', failed: 'delete' },
};

async function applyStep(target: EnvTarget, step: EnvPushStep, vars: Record<string, string>) {
	const { name, isSecret } = step;

	if (step.action === 'add') await createPlatformEnvVar(target, { name, value: vars[name], isSecret });
	else if (step.action === 'remove') await deletePlatformEnvVar(target, name);
	else await updatePlatformEnvVar(target, { name, value: vars[name], isSecret });
}

export class EnvPushCommand extends ApifyCommand<typeof EnvPushCommand> {
	static override name = 'push' as const;

	static override description =
		"Uploads .env to an Actor version. Shows the changes and asks before it makes them. Adds and updates variables; --prune also deletes the ones that aren't in .env. New variables are secrets unless --plain is passed. Keys with an empty value are skipped.";

	static override examples = [
		{
			description: 'Upload .env to the Actor in the current directory. Shows the changes and asks first.',
			command: 'apify env push',
		},
		{
			description: "Make the version match .env without a prompt, deleting the variables that aren't in .env.",
			command: 'apify env push --prune --yes',
		},
		{
			description: 'Upload the .env of one Actor in a monorepo, creating new variables as plain text.',
			command: 'apify env push --dir actors/scraper --plain',
		},
	];

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-env-push';

	static override enableJsonFlag = true;

	static override enableProfileFlag = true;

	static override interactive = true;

	static override interactiveNote = 'Shows the changes and asks before it makes them. Pass --yes to skip the prompt.';

	static override flags = {
		...envTargetFlags,
		prune: Flags.boolean({
			description: "Also delete variables on the platform that aren't in .env.",
			default: false,
		}),
		plain: Flags.boolean({
			description: 'Create new variables as plain text instead of secrets. Existing variables keep their type.',
			default: false,
		}),
		...YesFlag(),
	};

	async run() {
		const { json, prune, plain, yes } = this.flags;

		const target = await resolveEnvTarget(this.flags);
		const dotEnv = readDotEnv(target.actorDir);

		if (!dotEnv.exists) {
			envFail(
				`No .env file in ${target.actorDir}. Create one with a NAME=value line per variable, or run apify env pull to start from the platform values.`,
			);
		}

		failOnMalformedLines(dotEnv, 'push');

		if (prune && !Object.keys(dotEnv.vars).length) {
			envFail(
				'The .env file defines no variables, so --prune would delete every variable. Add variables to .env, or delete them with apify env rm.',
			);
		}

		for (const [name, value] of Object.entries(dotEnv.vars)) {
			validateEnvVarName(name);
			if (value) validateEnvVarValue(name, value);
		}

		const platform = skipInvalidDotEnvNames(await listPlatformEnvVars(target));
		const steps = planEnvPush(compareEnvVars(dotEnv.vars, platform), { prune, plain });
		const writes = envPushWrites(steps);

		const printJson = (confirmed: boolean, changes: EnvPushChange[] = steps) => {
			if (!json) return;
			printJsonToStdout({
				ok: changes.every((change) => change.result !== 'failed'),
				operation: 'env-push',
				...targetJson(target),
				prune,
				confirmed,
				changes,
			});
		};

		if (!writes.length) {
			if (!json) simpleLog({ message: renderEnvPushPlan(target, steps), stdout: true });
			info({ message: 'Nothing to push.' });
			printJson(false);
			return;
		}

		if (!json || !yes) simpleLog({ message: renderEnvPushPlan(target, steps), stdout: !json });

		const confirmed = await useYesNoConfirm({
			message: `Push these changes to ${describeTarget(target)}?`,
			default: false,
			preAnswered: yes || undefined,
			errorMessageForStdin: 'apify env push asks before it changes anything. To push without a prompt, pass --yes.',
		});

		if (!confirmed) {
			info({ message: 'Nothing was pushed.' });
			printJson(false);
			return;
		}

		const results = new Map<string, EnvPushChange>();
		for (const step of writes) {
			const text = RESULT_TEXT[step.action]!;
			try {
				await applyStep(target, step, dotEnv.vars);
				results.set(step.name, { ...step, result: 'done' });
				simpleLog({
					message: `${chalk.green('✔')} ${text.done} ${step.name}${step.isSecret ? ' (secret)' : ''}`,
					stdout: !json,
				});
			} catch (err) {
				// Only the message: a network error carries the request body, and so the value.
				const { message } = err as Error;
				results.set(step.name, { ...step, result: 'failed', error: message });
				simpleLog({ message: `${chalk.red('✘')} Couldn't ${text.failed} ${step.name}: ${message}`, stdout: !json });
			}
		}

		const done = [...results.values()].filter((change) => change.result === 'done').length;
		const summary = `Pushed ${done} of ${writes.length} changes.`;

		if (done === writes.length) {
			success({ message: summary, stdout: !json });
		} else {
			process.exitCode = 1;
			error({ message: summary, stdout: !json });
		}

		printJson(
			true,
			steps.map((step) => results.get(step.name) ?? step),
		);

		if (done) printRebuildReminder(target);
	}
}
