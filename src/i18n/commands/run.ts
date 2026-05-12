import { defineMessages } from '../../lib/i18n/index.js';

export const RunCommandMessages = defineMessages({
	en: {
		actorConfigErrorWithCause: {
			markdown: '{message}\n  {cause}',
			json: () => null,
		},
		unknownProjectFormat: {
			markdown:
				'Actor is of an unknown format. Make sure your project is supported by Apify CLI (either a package.json file is present, or a Python entrypoint could be found) or you are in a migrated Scrapy project.',
			json: () => null,
		},
		noNodeRuntime: {
			markdown:
				'No Node.js detected! Please install Node.js {supportedVersion} (or higher) to be able to run Node.js Actors locally.',
			json: () => null,
		},
		noPythonRuntime: {
			markdown:
				'No Python detected! Please install Python {supportedVersion} (or higher) to be able to run Python Actors locally.',
			json: () => null,
		},
		noRuntime: {
			markdown:
				'No runtime detected! Make sure you have Python {pythonVersion} (or higher) or Node.js {nodeVersion} (or higher) installed.',
			json: () => null,
		},
		noEntrypoint: {
			markdown:
				'No entrypoint detected! Please provide an entrypoint using the --entrypoint flag, or make sure your project has an entrypoint.',
			json: () => null,
		},
		legacyStorageRenamed: {
			markdown:
				'The legacy `apify_storage` directory was renamed to `{storagePath}` to align it with Apify SDK v3. Contents were left intact.',
			json: () => null,
		},
		storesPurged: {
			markdown: 'All default local stores were purged.',
			json: () => null,
		},
		storageNotEmpty: {
			markdown:
				'The storage directory contains a previous state, the Actor will continue where it left off. To start from the initial state, use --purge parameter to clean the storage directory.',
			json: () => null,
		},
		notLoggedIn: {
			markdown:
				'You are not logged in with your Apify Account. Some features like Apify Proxy will not work. Call "apify login" to fix that.',
			json: () => null,
		},
		unsupportedNodeVersion: {
			markdown:
				'You are running Node.js version {currentVersion}, which is no longer supported. Please upgrade to Node.js version {minimumVersion} or later.',
			json: () => null,
		},
		noScriptsInPackageJson: {
			markdown:
				'No scripts were found in package.json. Please set it up for your project. For more information about that call "apify help run".',
			json: () => null,
		},
		scriptNotFound: {
			markdown:
				'The script "{entrypoint}" was not found in package.json. Please set it up for your project. For more information about that call "apify help run".',
			json: () => null,
		},
		noNpmExecutable: {
			markdown:
				'No npm executable found! Please make sure your Node.js runtime has npm installed if you want to run package.json scripts locally.',
			json: () => null,
		},
		pythonVersionTooLow: {
			markdown: 'Python Actors require Python 3.9 or higher, but you have Python {currentVersion}!',
			json: () => null,
		},
		pleaseInstallPython: {
			markdown: 'Please install Python 3.9 or higher to be able to run Python Actors locally.',
			json: () => null,
		},
		failedToDetectLanguage: {
			markdown:
				'Failed to detect the language of your project. Please report this issue to the Apify team with your project structure over at https://github.com/apify/apify-cli/issues',
			json: () => null,
		},
		inputFileOverwritten: {
			markdown:
				'The "{filePath}" file was overwritten during the run. The CLI will not undo the setting of missing default fields from your input schema.',
			json: () => null,
		},
		stdinInputInvalid: {
			markdown: 'The input provided through standard input is invalid. Please fix the following errors:\n',
			json: () => null,
		},
		flagInputInvalid: {
			markdown: 'The input provided through the --input flag is invalid. Please fix the following errors:\n',
			json: () => null,
		},
		fileInputInvalid: {
			markdown: 'The input provided through the {source} file is invalid. Please fix the following errors:\n',
			json: () => null,
		},
		storedInputInvalid: {
			markdown: 'The input in your storage is invalid. Please fix the following errors:\n',
			json: () => null,
		},
		invalidInputErrors: {
			markdown: '{header}{errors}',
			json: () => null,
		},
		storedInputNotObject: {
			markdown: 'The input in your storage is invalid. It should be an object, not an array.',
			json: () => null,
		},
	},
});
