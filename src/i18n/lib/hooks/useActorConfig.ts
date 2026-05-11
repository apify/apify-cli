import { defineMessages } from '../../../lib/i18n/index.js';

export const useActorConfigMessages = defineMessages({
	en: {
		failedToReadConfig: {
			markdown: "Failed to read local config at path: ''{configPath}'':",
			json: () => null,
		},
		ignoringDeprecatedConfig: {
			markdown:
				'The "apify.json" file present in your Actor directory will be ignored, and the new ".actor/actor.json" file will be used instead. Please, either rename or remove the old file.',
			json: () => null,
		},
		renamedDeprecatedConfig: {
			markdown:
				'The "apify.json" file has been renamed to "apify.json.deprecated". The deprecated file is no longer used by the CLI or Apify Console. If you do not need it for some specific purpose, it can be safely deleted.',
			json: () => null,
		},
		renameDeprecatedConfigFailed: {
			markdown: 'Failed to rename the deprecated "apify.json" file to "apify.json.deprecated".\n  {message}',
			json: () => null,
		},
		migrationDeclined: {
			markdown:
				'Command can not run with old "apify.json" structure. Either let the CLI auto-update it or follow the guide on https://github.com/apify/apify-cli/blob/master/MIGRATIONS.md and update it manually.',
			json: () => null,
		},
		writeNewActorJsonFailed: {
			markdown: "Failed to write the new \"actor.json\" file to path: ''{configPath}''.\n  {message}",
			json: () => null,
		},
		migrationCompleted: {
			markdown:
				'The "apify.json" file has been migrated to ".actor/actor.json" and the original file renamed to "apify.json.deprecated". The deprecated file is no longer used by the CLI or Apify Console. If you do not need it for some specific purpose, it can be safely deleted. Do not forget to commit the new file to your Git repository.',
			json: () => null,
		},
	},
});
