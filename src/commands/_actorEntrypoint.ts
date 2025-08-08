import type { BuiltApifyCommand } from '../lib/command-framework/apify-command.js';
import { ActorChargeCommand } from './actor/charge.js';
import { ActorGetInputCommand } from './actor/get-input.js';
import { ActorGetPublicUrlCommand } from './actor/get-public-url.js';
import { ActorGetValueCommand } from './actor/get-value.js';
import { ActorPushDataCommand } from './actor/push-data.js';
import { ActorSetValueCommand } from './actor/set-value.js';
import { InstallCommand } from './cli-management/install.js';
import { UpgradeCommand } from './cli-management/upgrade.js';
import { HelpCommand } from './help.js';
import { TelemetryIndexCommand } from './telemetry/_index.js';

export const actorCommands = [
	//
	ActorSetValueCommand,
	ActorPushDataCommand,
	ActorGetValueCommand,
	ActorGetPublicUrlCommand,
	ActorGetInputCommand,
	ActorChargeCommand,

	// top-level
	HelpCommand,
	UpgradeCommand,
	InstallCommand,

	// namespaces
	TelemetryIndexCommand,
] as const satisfies (typeof BuiltApifyCommand)[];
