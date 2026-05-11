import { defineMessages } from '../../lib/i18n/index.js';

export const EditInputSchemaCommandMessages = defineMessages({
	en: {
		embeddedSchemaUnsupported: {
			markdown: 'Editing an input schema directly embedded in `{configPath}` is not yet supported.',
			json: () => null,
		},
		experimentalWarning: {
			markdown: 'This command is still experimental and might break at any time. Use at your own risk.\n',
			json: () => null,
		},
		editingSchema: {
			markdown: 'Editing input schema at "{path}"...',
			json: () => null,
		},
		schemaLoaded: {
			markdown: 'Input schema loaded from "{path}"',
			json: () => null,
		},
		emptySchemaInitialized: {
			markdown: 'Empty input schema initialized.',
			json: () => null,
		},
		readError: {
			markdown: 'Reading input schema from disk failed with: {message}',
			json: () => null,
		},
		parseError: {
			markdown: 'Parsing input schema failed with error: {message}',
			json: () => null,
		},
		schemaSent: {
			markdown: 'Input schema sent to editor.',
			json: () => null,
		},
		gotSchema: {
			markdown: 'Got input schema from editor...',
			json: () => null,
		},
		schemaSaved: {
			markdown: 'Input schema saved to disk.',
			json: () => null,
		},
		saveError: {
			markdown: 'Saving input schema failed with error: {message}',
			json: () => null,
		},
		editorClosed: {
			markdown: 'Editor closed, finishing...',
			json: () => null,
		},
		editingFinished: {
			markdown: 'Editing finished, you can close the editor.',
			json: () => null,
		},
		done: {
			markdown: 'Done.',
			json: () => null,
		},
		listening: {
			markdown: 'Listening for messages from input schema editor on port {port,number}...',
			json: () => null,
		},
		openingEditor: {
			markdown: 'Opening input schema editor at "{url}"...',
			json: () => null,
		},
	},
});
