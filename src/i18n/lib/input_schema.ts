import { defineMessages } from '../../lib/i18n/index.js';

export const inputSchemaMessages = defineMessages({
	en: {
		inputSchemaFileMissing: {
			markdown: 'Input schema file not found at {fullPath} (referenced in {configPath}).',
			json: () => null,
		},
		inputSchemaNotFoundAt: {
			markdown: 'Input schema has not been found at {inputSchemaPath}.',
			json: () => null,
		},
		storageSchemaFileMissing: {
			markdown: '{label} schema file not found at {fullPath} (referenced in {configPath}).',
			json: () => null,
		},
		createDefaultInputFailed: {
			markdown:
				'Could not create default input based on input schema, creating empty input instead. Cause: {message}',
			json: () => null,
		},
		schemaInvalid: {
			markdown: '{schemaName} schema is not valid:\n{details}',
			json: () => null,
		},
	},
});
