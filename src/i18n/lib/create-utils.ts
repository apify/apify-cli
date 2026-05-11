import { defineMessages } from '../../lib/i18n/index.js';

export const createUtilsMessages = defineMessages({
	en: {
		templateNotFound: {
			markdown: 'Could not find the selected template: {templateName} in the list of templates.',
			json: () => null,
		},
		readmeSuffixFailed: {
			markdown: 'Could not append local development instructions to README.md. Cause: {message}',
			json: () => null,
		},
		actorCreatedWithInstall: {
			markdown:
				'✅ Actor `{actorName}` created successfully!\n\nNext steps:\n\ncd "{actorName}"\napify run\n\n💡 Tip: Use `apify push` to deploy your Actor to the Apify platform\n📖 Docs: https://docs.apify.com/platform/actors/development',
			json: () => null,
		},
		actorCreatedWithoutInstall: {
			markdown:
				'✅ Actor `{actorName}` created successfully!\n\nNext steps:\n\ncd "{actorName}"\n{installLine}\napify run\n\n💡 Tip: Use `apify push` to deploy your Actor to the Apify platform\n📖 Docs: https://docs.apify.com/platform/actors/development',
			json: () => null,
		},
		installCommandFallback: {
			markdown: 'install dependencies with your package manager',
			json: () => null,
		},
		gitInitialized: {
			markdown:
				'\n🌱 Git repository initialized in `{actorName}`. You can now commit and push your Actor to Git.',
			json: () => null,
		},
	},
});
