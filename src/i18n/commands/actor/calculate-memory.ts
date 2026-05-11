import { defineMessages } from '../../../lib/i18n/index.js';

export const ActorCalculateMemoryCommandMessages = defineMessages({
	en: {
		missingMemoryExpression: {
			markdown:
				'No memory-calculation expression found. Provide it via the --default-memory-mbytes flag or define defaultMemoryMbytes in actor.json.',
			json: () => null,
		},
		evaluatingExpression: {
			markdown: 'Evaluating memory expression: {memoryExpression}',
			json: () => null,
		},
		calculatedMemory: {
			markdown: 'Calculated memory: {result} MB',
			json: () => null,
		},
		calculationFailed: {
			markdown: 'Memory calculation failed: {message}',
			json: () => null,
		},
		configLoadError: {
			markdown: '{message}',
			json: () => null,
		},
		configLoadErrorWithCause: {
			markdown: '{message}\n  {cause}',
			json: () => null,
		},
	},
});
