import { defineMessages } from '../../../lib/i18n/index.js';

export const useCwdProjectMessages = defineMessages({
	en: {
		multiplePackagesFound: {
			markdown: `Multiple Python packages found:\n{packageList}\n\nApify CLI cannot determine which package to run.\nPlease specify the package using the --entrypoint flag, e.g.:\n  apify run --entrypoint '<'package_name'>'`,
			json: () => null,
		},
		nearMissPackages: {
			markdown:
				'Found directories that appear to be Python packages but have issues:\n{suggestions}\n\nA valid Python package requires a directory with a valid identifier name (letters, numbers, underscores) and an __init__.py file.',
			json: () => null,
		},
		noValidPackageFound: {
			markdown:
				'No Python package found. Found Python files, but no valid package structure detected.\nA Python package requires:\n  - A directory with a valid Python identifier name (letters, numbers, underscores)\n  - An __init__.py file inside the directory\n\nCommon package structures:\n  my_package/\n    __init__.py\n    main.py\n\n  src/\n    my_package/\n      __init__.py\n      main.py',
			json: () => null,
		},
	},
});
