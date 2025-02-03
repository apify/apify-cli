import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { gte } from 'semver';

import { CRAWLEE_PACKAGES, VERSION_WHEN_APIFY_MOVED_TO_CRAWLEE_JS } from './shared.js';
import { detectPythonModuleVersion, PYTHON_MODULE_VERSION_NOT_EXISTENT } from '../utils.js';

export class CrawleeAnalyzer {
	static isApplicable(pathname: string) {
		const hasPackageJson = existsSync(join(pathname, 'package.json'));

		if (hasPackageJson) {
			const packageJson = readFileSync(join(pathname, 'package.json'), 'utf8');

			try {
				const packageJsonParsed = JSON.parse(packageJson);

				if (CRAWLEE_PACKAGES.some((pkg) => packageJsonParsed?.dependencies?.[pkg] !== undefined)) {
					return true;
				}

				// Check if they have apify >= 3.0.0
				const apifyVersion = packageJsonParsed?.dependencies?.apify;
				if (!apifyVersion) {
					return false;
				}

				let actualVersion = apifyVersion;

				if (apifyVersion.startsWith('~') || apifyVersion.startsWith('^')) {
					actualVersion = apifyVersion.slice(1);
				}

				return gte(actualVersion, VERSION_WHEN_APIFY_MOVED_TO_CRAWLEE_JS);
			} catch {
				return false;
			}
		}

		const maybePythonProject = existsSync(join(pathname, 'src/__main__.py'));

		if (maybePythonProject) {
			const crawleeVersion = detectPythonModuleVersion(pathname, 'crawlee');

			return crawleeVersion !== PYTHON_MODULE_VERSION_NOT_EXISTENT;
		}

		return false;
	}
}
