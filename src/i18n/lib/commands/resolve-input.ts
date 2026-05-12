import { defineMessages } from '../../../lib/i18n/index.js';

export const resolveInputMessages = defineMessages({
	en: {
		inputMustBeObject: {
			markdown: 'The provided input is invalid. It should be an object, not an array.',
			json: () => null,
		},
		cannotParseStdinJson: {
			markdown: 'Cannot parse JSON input from standard input.\n  {message}',
			json: () => null,
		},
		stdinDashRequiresPipe: {
			markdown: 'You need to pipe something into standard input when you specify the `-` value to `--input`.',
			json: () => null,
		},
		inputFlagIsPath: {
			markdown: 'Providing a JSON file path in the --input flag is not supported. Use the "--input-file=" flag instead',
			json: () => null,
		},
		cannotParseInputJson: {
			markdown: 'Cannot parse JSON input.\n  {message}',
			json: () => null,
		},
		inputFileDashRequiresPipe: {
			markdown: 'You need to pipe something into standard input when you specify the `-` value to `--input-file`.',
			json: () => null,
		},
		cannotReadInputFile: {
			markdown: 'Cannot read input file at path "{fullPath}".\n  {message}',
			json: () => null,
		},
	},
});
