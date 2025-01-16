import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { gte } from 'semver';

import { CRAWLEE_PACKAGES, VERSION_WHEN_APIFY_MOVED_TO_CRAWLEE_JS } from './shared.js';

export class CrawleeAnalyzer {
	static isApplicable(pathname: string) {
		const hasPackageJson = existsSync(join(pathname, 'package.json'));
		const hasRequirementsTxt = existsSync(join(pathname, 'requirements.txt'));

		if (!hasPackageJson && !hasRequirementsTxt) {
			return false;
		}

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

		if (hasRequirementsTxt) {
			const requirementsTxt = readFileSync(join(pathname, 'requirements.txt'), 'utf8');

			const lines = requirementsTxt.split('\n');

			return lines.some((line) => CRAWLEE_PACKAGES.some((pkg) => line.includes(pkg)));
		}

		return false;
	}
}
