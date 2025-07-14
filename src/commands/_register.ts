import type { BuiltApifyCommand } from '../lib/command-framework/apify-command.js';
import { ActorIndexCommand } from './actor/_index.js';
import { ActorChargeCommand } from './actor/charge.js';
import { ActorGetInputCommand } from './actor/get-input.js';
import { ActorGetPublicUrlCommand } from './actor/get-public-url.js';
import { ActorGetValueCommand } from './actor/get-value.js';
import { ActorPushDataCommand } from './actor/push-data.js';
import { ActorSetValueCommand } from './actor/set-value.js';
import { ActorsIndexCommand } from './actors/_index.js';
import { BuildsIndexCommand } from './builds/_index.js';
import { TopLevelCallCommand } from './call.js';
import { UpgradeCommand } from './cli-management/upgrade.js';
import { CreateCommand } from './create.js';
import { DatasetsIndexCommand } from './datasets/_index.js';
import { EditInputSchemaCommand } from './edit-input-schema.js';
import { HelpCommand } from './help.js';
import { InfoCommand } from './info.js';
import { InitCommand } from './init.js';
import { WrapScrapyCommand } from './init-wrap-scrapy.js';
import { KeyValueStoresIndexCommand } from './key-value-stores/_index.js';
import { LoginCommand } from './login.js';
import { LogoutCommand } from './logout.js';
import { TopLevelPullCommand } from './pull.js';
import { ToplevelPushCommand } from './push.js';
import { RequestQueuesIndexCommand } from './request-queues/_index.js';
import { RunCommand } from './run.js';
import { RunsIndexCommand } from './runs/_index.js';
import { SecretsIndexCommand } from './secrets/_index.js';
import { TasksIndexCommand } from './task/_index.js';
import { ValidateInputSchemaCommand } from './validate-schema.js';

export const apifyCommands = [
	// namespaces
	ActorIndexCommand,
	ActorsIndexCommand,
	BuildsIndexCommand,
	DatasetsIndexCommand,
	KeyValueStoresIndexCommand,
	RequestQueuesIndexCommand,
	RunsIndexCommand,
	SecretsIndexCommand,
	TasksIndexCommand,
	// top-level
	TopLevelCallCommand,
	UpgradeCommand,
	CreateCommand,
	EditInputSchemaCommand,
	InfoCommand,
	WrapScrapyCommand,
	InitCommand,
	LoginCommand,
	LogoutCommand,
	TopLevelPullCommand,
	ToplevelPushCommand,
	RunCommand,
	ValidateInputSchemaCommand,
	HelpCommand,
] as const satisfies (typeof BuiltApifyCommand)[];

export const actorCommands = [
	//
	ActorSetValueCommand,
	ActorPushDataCommand,
	ActorGetValueCommand,
	ActorGetPublicUrlCommand,
	ActorGetInputCommand,
	ActorChargeCommand,
	HelpCommand,
	UpgradeCommand,
] as const satisfies (typeof BuiltApifyCommand)[];
