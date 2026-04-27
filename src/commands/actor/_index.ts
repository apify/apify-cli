import { ApifyCommand } from '../../lib/command-framework/apify-command.js';
import { ActorCalculateMemoryCommand } from './calculate-memory.js';
import { ActorChargeCommand } from './charge.js';
import { ActorGenerateSchemaTypesCommand } from './generate-schema-types.js';
import { ActorGetInputCommand } from './get-input.js';
import { ActorGetPublicUrlCommand } from './get-public-url.js';
import { ActorGetValueCommand } from './get-value.js';
import { ActorPushDataCommand } from './push-data.js';
import { ActorSetValueCommand } from './set-value.js';

export class ActorIndexCommand extends ApifyCommand<typeof ActorIndexCommand> {
	static override name = 'actor' as const;

	static override description =
		`Runtime data operations intended to be called from inside a running Actor: read input, push data, get/set records in the default key-value store, charge pay-per-event, generate schema types.\n\n` +
		`For platform-level management (deploy, list, call Actors), see 'apify actors' (plural).`;

	static override group = 'Apify Console';

	static override docsUrl = 'https://docs.apify.com/cli/docs/reference#apify-actor';

	static override subcommands = [
		//
		ActorSetValueCommand,
		ActorPushDataCommand,
		ActorGetValueCommand,
		ActorGetPublicUrlCommand,
		ActorGetInputCommand,
		ActorChargeCommand,
		ActorCalculateMemoryCommand,
		ActorGenerateSchemaTypesCommand,
	];

	async run() {
		this.printHelp();
	}
}
