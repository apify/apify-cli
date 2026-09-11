import process from 'node:process';

import { describe, afterEach, it, expect } from 'vitest';

import { error, logError } from '../../../src/lib/outputs.js';
import { useConsoleSpy } from '../../__setup__/hooks/useConsoleSpy.js';

useConsoleSpy();

describe('outputs', () => {
	afterEach(() => {
		process.exitCode = undefined;
	});

	describe('error()', () => {
		it('sets process.exitCode to 1', () => {
			error({ message: 'something went wrong' });
			expect(process.exitCode).toBe(1);
		});

		it('does not downgrade an already-set non-zero exitCode', () => {
			process.exitCode = 5;
			error({ message: 'something went wrong' });
			expect(process.exitCode).toBe(5);
		});
	});

	describe('logError()', () => {
		it('does NOT set process.exitCode', () => {
			logError({ message: 'transient error in callback' });
			expect(process.exitCode).toBeUndefined();
		});
	});
});
