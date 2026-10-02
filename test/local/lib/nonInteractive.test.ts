import process from 'node:process';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { CreateCommand } from '../../../src/commands/create.js';
import { testRunCommand } from '../../../src/lib/command-framework/apify-command.js';
import { detectIsInteractive } from '../../../src/lib/hooks/telemetry/detectEnvironment.js';
import type { StdinCheckWrapperInput } from '../../../src/lib/hooks/user-confirmations/_stdinCheckWrapper.js';
import { stdinCheckWrapper } from '../../../src/lib/hooks/user-confirmations/_stdinCheckWrapper.js';
import {
	AGENT_ENV_VARS,
	isNonInteractive,
	NON_INTERACTIVE_ENV_VAR,
	resetNonInteractiveFlag,
	setNonInteractiveFlag,
} from '../../../src/lib/nonInteractiveMode.js';

describe('nonInteractiveMode', () => {
	// Save and clear all agent env vars before each test so isNonInteractive()
	// starts from a clean baseline regardless of the host environment (e.g. Claude Code sets CLAUDECODE).
	const savedAgentEnvVars: Record<string, string | undefined> = {};

	beforeEach(() => {
		for (const [envVar] of AGENT_ENV_VARS) {
			savedAgentEnvVars[envVar] = process.env[envVar];
			delete process.env[envVar];
		}
	});

	afterEach(() => {
		resetNonInteractiveFlag();
		delete process.env[NON_INTERACTIVE_ENV_VAR];
		for (const [envVar] of AGENT_ENV_VARS) {
			if (savedAgentEnvVars[envVar] === undefined) {
				delete process.env[envVar];
			} else {
				process.env[envVar] = savedAgentEnvVars[envVar];
			}
		}
		process.exitCode = undefined;
	});

	test('isNonInteractive() returns false by default', () => {
		expect(isNonInteractive()).toBe(false);
	});

	test('isNonInteractive() returns true when env var is set', () => {
		process.env[NON_INTERACTIVE_ENV_VAR] = '1';
		expect(isNonInteractive()).toBe(true);
	});

	test('isNonInteractive() returns true after setNonInteractiveFlag(true)', () => {
		setNonInteractiveFlag(true);
		expect(isNonInteractive()).toBe(true);
	});

	test('resetNonInteractiveFlag() clears flag set by setNonInteractiveFlag(true)', () => {
		setNonInteractiveFlag(true);
		resetNonInteractiveFlag();
		expect(isNonInteractive()).toBe(false);
	});

	test('stdinCheckWrapper throws with non-interactive message when no providedConfirmFromStdin', async () => {
		setNonInteractiveFlag(true);
		const wrapped = stdinCheckWrapper(async (_input: StdinCheckWrapperInput<string>) => 'result');
		await expect(wrapped({})).rejects.toThrow('This command requires interactive input. Pass --non-interactive');
	});

	test('stdinCheckWrapper returns providedConfirmFromStdin without prompting when non-interactive', async () => {
		setNonInteractiveFlag(true);
		const wrapped = stdinCheckWrapper(async (_input: StdinCheckWrapperInput<string>) => 'prompted-result');
		const result = await wrapped({ providedConfirmFromStdin: 'confirmed' });
		expect(result).toBe('confirmed');
	});

	test('detectIsInteractive() returns false when isNonInteractive() is true', () => {
		setNonInteractiveFlag(true);
		expect(detectIsInteractive()).toBe(false);
	});

	test('isNonInteractive() returns true when a known agent env var is set (CLAUDECODE)', () => {
		process.env['CLAUDECODE'] = '1';
		expect(isNonInteractive()).toBe(true);
	});

	test('create command with --non-interactive and no name/template exits non-zero with clear message', async () => {
		process.env[NON_INTERACTIVE_ENV_VAR] = '1';
		await testRunCommand(CreateCommand, {});
		expect(process.exitCode).toBe(1);
	});
});
