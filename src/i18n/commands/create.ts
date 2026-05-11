import { defineMessages } from '../../lib/i18n/index.js';

export const CreateCommandMessages = defineMessages({
	en: {
		manifestFetchFailed: {
			markdown: 'Could not fetch template list from server. Cause: {cause}',
			json: () => null,
		},
		directoryExists: {
			markdown:
				'Cannot create new Actor, directory `{actorName}` already exists. Please provide a different name. You can use "apify init" to create a local Actor environment inside an existing directory.',
			json: () => null,
		},
		noNodeDetected: {
			markdown:
				'No Node.js detected! Please install Node.js {minimumVersion} or higher to be able to run Node.js Actors locally.',
			json: () => null,
		},
		noPythonDetected: {
			markdown:
				'No Python detected! Please install Python {minimumVersion} or higher to be able to run Python Actors locally.',
			json: () => null,
		},
		nodeUnsupported: {
			markdown:
				'You are running Node.js version {version}, which is no longer supported. Please upgrade to Node.js version {minimumVersion} or later.',
			json: () => null,
		},
		pythonUnsupported: {
			markdown: 'Python Actors require Python 3.9 or higher, but you have Python {version}!',
			json: () => null,
		},
		pythonUnsupportedHint: {
			markdown: 'Please install Python 3.9 or higher to be able to run Python Actors locally.',
			json: () => null,
		},
		pythonDetected: {
			markdown: 'Python version {version} detected.',
			json: () => null,
		},
		creatingVenv: {
			markdown:
				'Creating a virtual environment in "{venvPath}" and installing dependencies from "requirements.txt"...',
			json: () => null,
		},
		blankLine: {
			markdown: '',
			json: () => null,
		},
		successMessage: {
			markdown: '{message}',
			json: () => null,
		},
		gitInitFailed: {
			markdown: 'Failed to initialize git repository: {message}',
			json: () => null,
		},
		gitInitManualHint: {
			markdown: 'You can manually run "git init" in the Actor directory if needed.',
			json: () => null,
		},
	},
});
