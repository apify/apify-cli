import { CheckVersionCommand } from './check-version.js';
import { CreateCommand } from './create.js';
import { EditInputSchemaCommand } from './edit-input-schema.js';
import { InfoCommand } from './info.js';
import { WrapScrapyCommand } from './init-wrap-scrapy.js';
import { InitCommand } from './init.js';
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
import type { BuiltApifyCommand } from '../lib/command-framework/apify-command.js';

export const apifyCommands: (typeof BuiltApifyCommand)[] = [
	// namespaces
	KeyValueStoresIndexCommand,
	RequestQueuesIndexCommand,
	RunsIndexCommand,
	SecretsIndexCommand,
	TasksIndexCommand,
	// top-level
	CheckVersionCommand,
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
];

export const actorCommands: (typeof BuiltApifyCommand)[] = [
	//
];
