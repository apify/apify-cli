import { defineMessages } from '../../../lib/i18n/index.js';

export const ActorGenerateSchemaTypesCommandMessages = defineMessages({
	en: {
		generatingFromInputSchemaAt: {
			markdown: 'Generating types from input schema at {schemaPath}',
			json: () => null,
		},
		generatingFromInputSchemaEmbedded: {
			markdown: "Generating types from input schema embedded in ''{configPath}''",
			json: () => null,
		},
		generatedTypesWritten: {
			markdown: 'Generated types written to {outputFile}',
			json: () => null,
		},
		experimentalDatasetAt: {
			markdown: '[experimental] Generating types from Dataset schema at {schemaPath}',
			json: () => null,
		},
		experimentalDatasetEmbedded: {
			markdown: "[experimental] Generating types from Dataset schema embedded in ''{configPath}''",
			json: () => null,
		},
		datasetHasNoFields: {
			markdown: 'Dataset schema has no fields defined, skipping type generation.',
			json: () => null,
		},
		experimentalOutputAt: {
			markdown: '[experimental] Generating types from Output schema at {schemaPath}',
			json: () => null,
		},
		experimentalOutputEmbedded: {
			markdown: "[experimental] Generating types from Output schema embedded in ''{configPath}''",
			json: () => null,
		},
		outputHasNoProperties: {
			markdown: 'Output schema has no properties defined, skipping type generation.',
			json: () => null,
		},
		experimentalKvsAt: {
			markdown: '[experimental] Generating types from Key-Value Store schema at {schemaPath}',
			json: () => null,
		},
		experimentalKvsEmbedded: {
			markdown: "[experimental] Generating types from Key-Value Store schema embedded in ''{configPath}''",
			json: () => null,
		},
		kvsHasNoCollections: {
			markdown: 'Key-Value Store schema has no collections with JSON schemas, skipping type generation.',
			json: () => null,
		},
		schemaGenerationFailed: {
			markdown: 'Failed to generate types for {label} schema: {message}',
			json: () => null,
		},
	},
});
