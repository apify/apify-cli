import { describe, expect, it } from 'vitest';

import { formatActorContextError } from '../../../../src/lib/commands/resolve-actor-context.js';

describe('formatActorContextError', () => {
	it('suggests checking token permissions when a full Actor ID was provided', () => {
		const message = formatActorContextError(
			'Actor with ID "some-user/missing-actor" was not found',
			'some-user/missing-actor',
		);

		expect(message).toBe(
			'Actor with ID "some-user/missing-actor" was not found. Check that the Actor ID or name is correct and that your API token has permission to access it.',
		);
	});

	it('suggests checking token permissions when a short Actor name or ID was provided', () => {
		const message = formatActorContextError('Actor with name or ID "missing-actor" was not found', 'missing-actor');

		expect(message).toContain('Check that the Actor ID or name is correct');
		expect(message).toContain('your API token has permission to access it');
	});

	it('keeps directory guidance when no Actor ID was provided', () => {
		const message = formatActorContextError('Unable to detect what Actor to create a build for');

		expect(message).toBe(
			'Unable to detect what Actor to create a build for. Please run this command in an Actor directory, or specify the Actor ID.',
		);
	});

	it('does not ask for an Actor ID when one was already provided', () => {
		const message = formatActorContextError(
			'Actor with ID "some-user/missing-actor" was not found',
			'some-user/missing-actor',
		);

		expect(message).not.toContain('or specify the Actor ID');
	});
});
