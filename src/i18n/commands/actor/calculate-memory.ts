import { defineMessages } from '../../../lib/i18n/index.js';

export const ActorCalculateMemoryCommandMessages = defineMessages({
	en: {
		missingMemoryExpression: {
			markdown:
				'No memory-calculation expression found. Provide it via the `--default-memory-mbytes` flag or define `defaultMemoryMbytes` in actor.json.',
			json: () => ({
				code: 'MISSING_MEMORY_EXPRESSION',
				hint: '--default-memory-mbytes <expression> OR define in actor.json',
			}),
		},
		evaluatingExpression: {
			markdown: 'Evaluating memory expression: {memoryExpression}',
			// Null won't print out anything in JSON mode
			json: () => null,
		},
		calculatedMemory: {
			markdown: 'Calculated memory: {result} MB',
			json: (props: { expression: string; resultMb: number }) => ({ ...props, code: 'CALCULATED_MEMORY' }),
		},
		calculationFailed: {
			markdown: 'Memory calculation failed: {message}',
			json: (message: string) => ({ code: 'CALCULATION_FAILED', message }),
		},
		configLoadError: {
			markdown: '{message}',
			json: (message: string) => ({ code: 'CONFIG_LOAD_ERROR', message }),
		},
		configLoadErrorWithCause: {
			markdown: '{message}\n  {cause}',
			json: (message: string, cause: string) => ({ code: 'CONFIG_LOAD_ERROR_WITH_CAUSE', message, cause }),
		},
	},
});
