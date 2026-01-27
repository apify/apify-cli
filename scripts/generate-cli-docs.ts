import { Commands } from './documentation-renderer/commands.js';
import type { CommandsInCategory } from './documentation-renderer/doc-building.js';
import { renderDocs } from './documentation-renderer/doc-building.js';

// This sets the maximum line length that will be rendered in the docs.
process.env.APIFY_CLI_MAX_LINE_WIDTH = '80';

const categories: Record<string, CommandsInCategory[]> = {
	'auth': [
		//
		{ command: Commands.auth },
		{ command: Commands.authLogin, aliases: [Commands.login] },
		{ command: Commands.authLogout, aliases: [Commands.logout] },
		{ command: Commands.authToken },
		{ command: Commands.info },
		{ command: Commands.secrets },
		{ command: Commands.secretsAdd },
		{ command: Commands.secretsLs },
		{ command: Commands.secretsRm },
	],
	'actor-dev': [
		//
		{ command: Commands.create },
		{ command: Commands.init },
		{ command: Commands.run },
		{ command: Commands.validateSchema },
	],
	'actor-basic': [
		//
		{ command: Commands.actors },
		{ command: Commands.actorsLs },
		{ command: Commands.actorsRm },

		{ command: Commands.actor },
		{ command: Commands.actorCalculateMemory },
		{ command: Commands.actorCharge },
		{ command: Commands.actorGenerateTypes },
		{ command: Commands.actorGetInput },
		{ command: Commands.actorGetPublicUrl },
		{ command: Commands.actorGetValue },
		{ command: Commands.actorPushData },
		{ command: Commands.actorSetValue },
	],
	'actor-deploy': [
		//
		{ command: Commands.actorsPush, aliases: [Commands.push] },
		{ command: Commands.actorsPull, aliases: [Commands.pull] },
		{ command: Commands.actorsCall, aliases: [Commands.call] },
		{ command: Commands.actorsStart },
		{ command: Commands.actorsInfo },
	],
	'actor-build': [
		//
		{ command: Commands.builds },
		{ command: Commands.buildsAddTag },
		{ command: Commands.buildsCreate, aliases: [Commands.actorsBuild] },
		{ command: Commands.buildsInfo },
		{ command: Commands.buildsLog },
		{ command: Commands.buildsLs },
		{ command: Commands.buildsRemoveTag },
		{ command: Commands.buildsRm },
	],
	'actor-run': [
		//
		{ command: Commands.runs },
		{ command: Commands.runsAbort },
		{ command: Commands.runsInfo },
		{ command: Commands.runsLog },
		{ command: Commands.runsLs },
		{ command: Commands.runsResurrect },
		{ command: Commands.runsRm },
	],
	'general': [
		//
		{ command: Commands.help },
		{ command: Commands.upgrade },
		{ command: Commands.telemetry },
		{ command: Commands.telemetryEnable },
		{ command: Commands.telemetryDisable },
	],
	'dataset': [
		//
		{ command: Commands.datasets },
		{ command: Commands.datasetsCreate },
		{ command: Commands.datasetsGetItems },
		{ command: Commands.datasetsInfo },
		{ command: Commands.datasetsLs },
		{ command: Commands.datasetsPushItems },
		{ command: Commands.datasetsRename },
		{ command: Commands.datasetsRm },
	],
	'keyval': [
		//
		{ command: Commands.keyValueStores },
		{ command: Commands.keyValueStoresCreate },
		{ command: Commands.keyValueStoresDeleteValue },
		{ command: Commands.keyValueStoresGetValue },
		{ command: Commands.keyValueStoresInfo },
		{ command: Commands.keyValueStoresKeys },
		{ command: Commands.keyValueStoresLs },
		{ command: Commands.keyValueStoresRename },
		{ command: Commands.keyValueStoresRm },
		{ command: Commands.keyValueStoresSetValue },
	],
	'reqqueue': [
		//
		{ command: Commands.requestQueues },
	],
	'task': [
		//
		{ command: Commands.task },
		{ command: Commands.taskRun },
	],
};

await renderDocs(categories);
