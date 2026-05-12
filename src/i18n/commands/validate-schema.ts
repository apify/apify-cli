import { defineMessages } from '../../lib/i18n/index.js';

export const ValidateSchemaCommandMessages = defineMessages({
	en: {
		validatingInputSchemaAtPath: {
			markdown: 'Validating input schema at {path}',
			json: () => null,
		},
		inputSchemaValid: {
			markdown: 'Input schema is valid.',
			json: () => null,
		},
		validatingInputSchemaAtLocation: {
			markdown: 'Validating input schema at {location}',
			json: () => null,
		},
		validatingInputSchemaEmbedded: {
			markdown: 'Validating input schema embedded in {configPath}',
			json: () => null,
		},
		validatingNamedSchemaAtLocation: {
			markdown: 'Validating {label} schema at {location}',
			json: () => null,
		},
		validatingNamedSchemaEmbedded: {
			markdown: 'Validating {label} schema embedded in {configPath}',
			json: () => null,
		},
		namedSchemaValid: {
			markdown: '{label} schema is valid.',
			json: () => null,
		},
		noSchemasFound: {
			markdown: 'No schemas found. Make sure {configPath} exists and defines at least one schema.',
			json: () => null,
		},
	},
});
